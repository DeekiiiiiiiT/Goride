import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeCashSettlementOutcome } from "./computeOutcome.ts";
import { buildSettlementJournalV2 } from "./buildSettlementJournalV2.ts";
import type { WalletDeltaPreview } from "./buildJournalEntries.ts";
import {
  applyPendingDebt,
  createPaymentObligation,
  getDriverDigitalAvailableMinor,
} from "./debtRepayment.ts";
import { hashSettlementRequest } from "./requestHash.ts";
import { postPaymentJournal } from "../../_shared/paymentAccounts.ts";
import { getRidesPaymentDb } from "../../_shared/ridesPaymentDb.ts";
import {
  filterLegacyRepairMissingLines,
  shouldSkipLegacySettlementRepair,
} from "./settlementRepairGuards.ts";

/**
 * Repairs V2 settlements where only the first journal line posted (legacy idempotency bug),
 * including rides that never received a cash_settlement_snapshot patch.
 * Safe to call repeatedly — inserts only missing entry types.
 */
export async function repairIncompleteCashSettlementsForDriver(
  ridesDb: SupabaseClient,
  driverUserId: string,
  currency = "JMD",
): Promise<number> {
  const result = await repairIncompleteCashSettlements(ridesDb, { driverUserId, currency });
  return result.repaired;
}

export async function repairIncompleteCashSettlementsForRider(
  ridesDb: SupabaseClient,
  riderUserId: string,
  currency = "JMD",
): Promise<number> {
  const result = await repairIncompleteCashSettlements(ridesDb, { riderUserId, currency });
  return result.repaired;
}

type WalletRepairResult = {
  repaired: number;
  userId: string;
  role: "driver" | "rider";
  ridesScanned: number;
  candidates: Array<{
    rideId: string;
    journalTypes: string[];
    missingTypes: string[];
    owed: number;
    received: number;
    action: "skip" | "conflict" | "inserted" | "no_missing" | "error";
    inserted?: number;
    error?: string;
  }>;
  error?: string;
};

function pubSvc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

const RIDE_REPAIR_SELECT =
  "id, rider_user_id, assigned_driver_user_id, currency, fare_final_minor, fare_estimate_minor, cash_received_minor, cash_settlement_outcome, payment_method";

async function loadCompletedRidesForRepair(
  filter: { driverUserId?: string; riderUserId?: string },
): Promise<{ rides: Array<Record<string, unknown>>; error?: string }> {
  const driverUserId = filter.driverUserId;
  const riderUserId = filter.riderUserId;
  const column = driverUserId ? "assigned_driver_user_id" : "rider_user_id";
  const userId = driverUserId ?? riderUserId ?? "";

  const pub = pubSvc();
  const { data: pubRides, error: pubErr } = await pub
    .from("rides_ride_requests")
    .select(RIDE_REPAIR_SELECT)
    .eq(column, userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(30);

  if (!pubErr && pubRides) {
    return { rides: pubRides as Array<Record<string, unknown>> };
  }

  return { rides: [], error: pubErr?.message ?? "ride_query_failed" };
}

async function repairIncompleteCashSettlements(
  ridesDb: SupabaseClient,
  filter: { driverUserId?: string; riderUserId?: string; currency: string },
): Promise<WalletRepairResult> {
  const driverUserId = filter.driverUserId;
  const riderUserId = filter.riderUserId;
  const currency = filter.currency;
  const userId = driverUserId ?? riderUserId ?? "";
  const role: "driver" | "rider" = driverUserId ? "driver" : "rider";
  const debug: WalletRepairResult = {
    repaired: 0,
    userId,
    role,
    ridesScanned: 0,
    candidates: [],
  };

  try {
  const { db: payClient, tables } = await getRidesPaymentDb();

  const { rides, error: ridesErr } = await loadCompletedRidesForRepair({
    driverUserId,
    riderUserId,
  });

  if (ridesErr) {
    debug.error = ridesErr;
    return debug;
  }

  debug.ridesScanned = (rides ?? []).length;
  let repaired = 0;

  for (const ride of rides ?? []) {
    const rideId = String(ride.id);
    const rideCurrency = String(ride.currency ?? currency);
    const driverId = String(ride.assigned_driver_user_id ?? "");
    const riderId = String(ride.rider_user_id ?? "");
    if (!driverId || !riderId) continue;

    const { data: journalRows } = await payClient
      .from(tables.journal)
      .select("entry_type, idempotency_key, amount_minor")
      .eq("ride_request_id", rideId);

    const existingTypes = new Set((journalRows ?? []).map((r) => String(r.entry_type)));
    const collectionRow = (journalRows ?? []).find((r) => r.entry_type === "cash_trip_collection");
    const snapshot = null as Record<string, unknown> | null;
    const outcome = String(ride.cash_settlement_outcome ?? "");

    if (shouldSkipLegacySettlementRepair({ outcome, existingTypes })) {
      debug.candidates.push({
        rideId,
        journalTypes: [...existingTypes],
        missingTypes: [],
        owed: 0,
        received: 0,
        action: "skip",
      });
      continue;
    }

    const isV2Ride = Boolean(collectionRow) ||
      snapshot?.settlement_version === 2 ||
      (ride.payment_method ?? "cash") === "cash";

    if (!isV2Ride || !collectionRow) {
      debug.candidates.push({
        rideId,
        journalTypes: [...existingTypes],
        missingTypes: [],
        owed: 0,
        received: 0,
        action: "skip",
      });
      continue;
    }

    const owed = Number(
      snapshot?.owed_minor ?? ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0,
    );
    const received = Number(
      snapshot?.cash_received_minor ??
        ride.cash_received_minor ??
        collectionRow?.amount_minor ??
        0,
    );
    if (!Number.isFinite(owed) || owed <= 0 || !Number.isFinite(received) || received <= 0) {
      debug.candidates.push({
        rideId,
        journalTypes: [...existingTypes],
        missingTypes: [],
        owed,
        received,
        action: "skip",
      });
      continue;
    }

    const computed = computeCashSettlementOutcome(owed, received);
    const digitalAvailable = await getDriverDigitalAvailableMinor(ridesDb, driverId, rideCurrency);
    const { lines, walletDeltas, debtOpenedMinor } = buildSettlementJournalV2({
      computed,
      rideId,
      currency: rideCurrency,
      riderUserId: riderId,
      driverUserId: driverId,
      digitalAvailableMinor: digitalAvailable,
    });

    if (lines.length === 0) continue;

    const missing = filterLegacyRepairMissingLines(lines, existingTypes);
    if (missing.length === 0) {
      debug.candidates.push({
        rideId,
        journalTypes: [...existingTypes],
        missingTypes: [],
        owed,
        received,
        action: "no_missing",
      });
      continue;
    }

    const baseKey = (journalRows ?? []).find((r) => r.idempotency_key)?.idempotency_key
      ?? `repair-${rideId}`;
    const repairBaseKey = String(baseKey).includes(":")
      ? String(baseKey).split(":")[0]
      : String(baseKey);

    const requestHash = await hashSettlementRequest({
      cash_received_minor: received,
      tip_received_minor: 0,
    });

    const result = await postPaymentJournal(ridesDb, {
      rideId,
      idempotencyKey: repairBaseKey,
      requestHash,
      currency: rideCurrency,
      lines: missing,
      createdByUserId: driverUserId ?? riderUserId ?? null,
    });

    if (result.conflict) {
      console.warn("[cashSettlement] repair_conflict", { ride_id: rideId });
      debug.candidates.push({
        rideId,
        journalTypes: [...existingTypes],
        missingTypes: missing.map((l) => l.entry_type),
        owed,
        received,
        action: "conflict",
      });
      continue;
    }

    if (result.inserted > 0) {
      try {
        if (debtOpenedMinor > 0) {
          await createPaymentObligation(ridesDb, {
            driverUserId: driverId,
            rideRequestId: rideId,
            amountMinor: debtOpenedMinor,
            currency: rideCurrency,
            obligationType: "change_to_rider",
          });
          await applyPendingDebt(ridesDb, driverId, rideCurrency, "repair_settlement");
        }

        await backfillRideSettlementFields(
          ridesDb,
          rideId,
          computed,
          walletDeltas,
          debtOpenedMinor,
          received,
        );

        repaired += 1;
        debug.candidates.push({
          rideId,
          journalTypes: [...existingTypes],
          missingTypes: missing.map((l) => l.entry_type),
          owed,
          received,
          action: "inserted",
          inserted: result.inserted,
        });
        console.info("[cashSettlement] repair_completed", {
          ride_id: rideId,
          inserted: result.inserted,
          change_credit_minor: computed.change_credit_minor,
          debt_opened_minor: debtOpenedMinor,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        debug.candidates.push({
          rideId,
          journalTypes: [...existingTypes],
          missingTypes: missing.map((l) => l.entry_type),
          owed,
          received,
          action: "error",
          error: msg,
        });
      }
    }
  }

  debug.repaired = repaired;
  return debug;
  } catch (e) {
    debug.error = e instanceof Error ? e.message : String(e);
    return debug;
  }
}

async function backfillRideSettlementFields(
  _ridesDb: SupabaseClient,
  rideId: string,
  computed: ReturnType<typeof computeCashSettlementOutcome>,
  walletDeltas: WalletDeltaPreview,
  debtOpenedMinor: number,
  received: number,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const snapshot = {
    settlement_version: 2,
    owed_minor: computed.owed_minor,
    cash_received_minor: computed.cash_received_minor,
    change_credit_minor: computed.change_credit_minor,
    arrears_minor: computed.arrears_minor,
    outcome: computed.outcome,
    wallet_deltas: walletDeltas,
    debt_opened_minor: debtOpenedMinor,
    settled_at: nowIso,
    repaired_at: nowIso,
  };

  const patch = {
    cash_received_minor: received,
    cash_settlement_outcome: computed.outcome,
    cash_settlement_status: "settled",
    cash_settlement_snapshot: snapshot,
    updated_at: nowIso,
  };

  const { data: rpcData, error: rpcError } = await pubSvc().rpc("rides_patch_ride_request", {
    p_id: rideId,
    p_patch: patch,
  });

  if (!rpcError && rpcData != null) return;

  console.error("[cashSettlement] repair_backfill_failed", {
    ride_id: rideId,
    error: rpcError?.message ?? "rpc_failed",
  });
}
