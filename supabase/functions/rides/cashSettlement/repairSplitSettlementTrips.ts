import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeSplitSettlement } from "./computeSplitSettlement.ts";
import { buildSplitPaymentJournalLines } from "./buildSplitPaymentJournalLines.ts";
import { isCashSettlementSplitPaymentEnabled } from "./flags.ts";
import { getDriverDigitalAvailableMinor } from "./debtRepayment.ts";
import { getRiderWalletAvailableMinor } from "./getRiderWalletAvailableMinor.ts";
import { postPaymentJournal } from "../../_shared/paymentAccounts.ts";
import { getRidesPaymentDb } from "../../_shared/ridesPaymentDb.ts";
import { settlementJournalAmountsForRide } from "./settlementJournalAmounts.ts";
import { applyPendingDebt } from "./debtRepayment.ts";

const RIDE_SELECT =
  "id, rider_user_id, assigned_driver_user_id, currency, fare_final_minor, fare_estimate_minor, cash_received_minor, cash_settlement_outcome, payment_method, status, cash_settlement_snapshot";

function pubSvc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

/**
 * Repairs legacy underpay cash trips: credits driver digital and reclassifies to split.
 * Idempotent — skips rides that already have wallet_fare_to_driver or platform_fare_guarantee.
 */
export async function repairSplitSettlementTripsForDriver(
  ridesDb: SupabaseClient,
  driverUserId: string,
  currency = "JMD",
): Promise<number> {
  if (!isCashSettlementSplitPaymentEnabled()) return 0;

  const { data: rides } = await pubSvc()
    .from("rides_ride_requests")
    .select(RIDE_SELECT)
    .eq("assigned_driver_user_id", driverUserId)
    .eq("status", "completed")
    .eq("payment_method", "cash")
    .in("cash_settlement_outcome", ["underpay", "split"])
    .order("completed_at", { ascending: false })
    .limit(20);

  if (!rides?.length) return 0;

  const { db: payClient, tables } = await getRidesPaymentDb();
  let repaired = 0;

  for (const ride of rides) {
    const rideId = String(ride.id);
    const outcome = String(ride.cash_settlement_outcome ?? "");
    if (outcome === "split") continue;

    const { data: journalRows } = await payClient
      .from(tables.journal)
      .select("entry_type")
      .eq("ride_request_id", rideId);

    const types = new Set((journalRows ?? []).map((r) => String(r.entry_type)));
    if (types.has("wallet_fare_to_driver") || types.has("platform_fare_guarantee")) {
      continue;
    }

    const owed = Number(ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0);
    const cashReceived = Number(ride.cash_received_minor ?? 0);
    if (owed <= 0 || cashReceived <= 0 || cashReceived >= owed) continue;

    const fromJournal = await settlementJournalAmountsForRide(rideId);
    const riderUserId = String(ride.rider_user_id ?? "");
    const driverId = String(ride.assigned_driver_user_id ?? "");
    if (!riderUserId || !driverId) continue;

    const rideCurrency = String(ride.currency ?? currency);
    const riderAvailable = await getRiderWalletAvailableMinor(ridesDb, riderUserId, rideCurrency);
    const walletPaidFromJournal = types.has("wallet_fare_from_rider")
      ? fromJournal.wallet_paid_minor
      : Math.min(owed - cashReceived, fromJournal.wallet_paid_minor || owed - cashReceived);

    const split = computeSplitSettlement({
      owedMinor: owed,
      cashReceivedMinor: cashReceived,
      riderWalletAvailableMinor: Math.max(walletPaidFromJournal, riderAvailable),
      splitEnabled: true,
    });

    if (split.storedOutcome !== "split") continue;

    const digitalAvailable = await getDriverDigitalAvailableMinor(ridesDb, driverId, rideCurrency);
    const { lines } = buildSplitPaymentJournalLines({
      split,
      rideId,
      currency: rideCurrency,
      riderUserId,
      driverUserId: driverId,
      digitalAvailableMinor: digitalAvailable,
    });

    const repairLines = lines.filter((line) =>
      line.entry_type === "wallet_fare_from_rider" ||
      line.entry_type === "wallet_fare_to_driver" ||
      line.entry_type === "platform_fare_guarantee" ||
      (line.entry_type === "cash_trip_arrears" && !types.has("cash_trip_arrears"))
    ).filter((line) => !types.has(line.entry_type));

    if (repairLines.length === 0) continue;

    const result = await postPaymentJournal(ridesDb, {
      rideId,
      idempotencyKey: `split-repair-${rideId}`,
      requestHash: `split-repair-${rideId}`,
      currency: rideCurrency,
      lines: repairLines,
      createdByUserId: driverId,
    });

    if (result.inserted > 0 || result.skipped) {
      const snapshot = {
        ...(ride.cash_settlement_snapshot as Record<string, unknown> ?? {}),
        settlement_version: 2,
        outcome: "split",
        wallet_paid_minor: split.wallet_paid_minor,
        rider_arrears_minor: split.rider_arrears_minor,
        driver_digital_credit_minor: split.driver_digital_credit_minor,
        platform_guarantee_minor: split.platform_guarantee_minor,
        repaired_at: new Date().toISOString(),
      };

      await pubSvc().rpc("rides_patch_ride_request", {
        p_id: rideId,
        p_patch: {
          cash_settlement_outcome: "split",
          cash_settlement_snapshot: snapshot,
          updated_at: new Date().toISOString(),
        },
      });

      if (split.driver_digital_credit_minor > 0) {
        await applyPendingDebt(ridesDb, driverId, rideCurrency, "split_repair");
      }

      repaired += 1;
      console.info("[cashSettlement] split_repair_completed", { ride_id: rideId });
    }
  }

  return repaired;
}
