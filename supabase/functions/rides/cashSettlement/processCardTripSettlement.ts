import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCardTripJournalLines } from "./buildCardTripJournal.ts";
import { computeCardTripSettlement } from "./computeCardTripSettlement.ts";
import { isCashSettlementV2Enabled } from "./flags.ts";
import { getRiderWalletAvailableMinor } from "./getRiderWalletAvailableMinor.ts";
import { postPaymentJournal } from "../../_shared/paymentAccounts.ts";
import { getRidesPaymentDb } from "../../_shared/ridesPaymentDb.ts";
import { resolveOwedFareMinor } from "./processCashSettlement.ts";

export function isCardTripRide(ride: Record<string, unknown>): boolean {
  return String(ride.payment_method ?? "") === "card";
}

async function hashCardTripSettlement(
  rideId: string,
  fareMinor: number,
  walletPaidMinor: number,
): Promise<string> {
  const normalized = JSON.stringify({
    ride_request_id: rideId,
    fare_minor: Math.floor(Number(fareMinor) || 0),
    wallet_paid_minor: Math.floor(Number(walletPaidMinor) || 0),
    settlement_version: 2,
  });
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function processCardTripSettlement(
  db: SupabaseClient,
  ride: Record<string, unknown>,
): Promise<{ ok: true; inserted: number } | { ok: false; reason: string }> {
  if (!isCashSettlementV2Enabled()) {
    return { ok: false, reason: "v2_disabled" };
  }
  if (String(ride.status ?? "") !== "completed") {
    return { ok: false, reason: "not_completed" };
  }
  if (!isCardTripRide(ride)) {
    return { ok: false, reason: "not_card" };
  }

  const rideId = String(ride.id);
  const driverUserId = String(ride.assigned_driver_user_id ?? "");
  const riderUserId = String(ride.rider_user_id ?? "");
  if (!driverUserId) {
    return { ok: false, reason: "no_driver" };
  }
  if (!riderUserId) {
    return { ok: false, reason: "no_rider" };
  }

  const fareMinor = resolveOwedFareMinor(ride);
  if (fareMinor == null || fareMinor <= 0) {
    return { ok: false, reason: "no_fare" };
  }

  const currency = String(ride.currency ?? "JMD");
  const riderAvailable = await getRiderWalletAvailableMinor(db, riderUserId, currency);
  const settlement = computeCardTripSettlement({
    fareMinor,
    riderWalletAvailableMinor: riderAvailable,
  });

  const lines = buildCardTripJournalLines({
    rideId,
    currency,
    driverUserId,
    riderUserId,
    settlement,
  });
  if (lines.length === 0) {
    return { ok: false, reason: "no_lines" };
  }

  const idempotencyKey = `card-settlement-${rideId}`;
  const requestHash = await hashCardTripSettlement(
    rideId,
    fareMinor,
    settlement.wallet_paid_minor,
  );

  const result = await postPaymentJournal(db, {
    rideId,
    idempotencyKey,
    requestHash,
    currency,
    lines,
    createdByUserId: driverUserId,
  });

  if (result.conflict) {
    return { ok: false, reason: "conflict" };
  }

  if (result.inserted > 0) {
    console.info("[cardSettlement] digital_credited", {
      ride_id: rideId,
      driver_user_id: driverUserId,
      fare_minor: fareMinor,
      wallet_paid_minor: settlement.wallet_paid_minor,
      card_charge_minor: settlement.card_charge_minor,
      inserted: result.inserted,
    });
  }

  return { ok: true, inserted: result.inserted };
}

function pubSvc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

async function cardTripSettlementExists(
  payClient: SupabaseClient,
  journalTable: string,
  rideId: string,
): Promise<boolean> {
  const prefix = `card-settlement-${rideId}:`;
  const { data } = await payClient
    .from(journalTable)
    .select("id")
    .eq("ride_request_id", rideId)
    .like("idempotency_key", `${prefix}%`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Backfill card trips that completed before digital wallet wiring. Safe to call repeatedly. */
export async function repairMissingCardTripSettlementsForDriver(
  ridesDb: SupabaseClient,
  driverUserId: string,
  currency = "JMD",
): Promise<number> {
  if (!isCashSettlementV2Enabled()) return 0;

  const { db: payClient, tables } = await getRidesPaymentDb();
  const { data: rides, error } = await pubSvc()
    .from("rides_ride_requests")
    .select("id, status, payment_method, assigned_driver_user_id, rider_user_id, currency, fare_final_minor, fare_estimate_minor")
    .eq("assigned_driver_user_id", driverUserId)
    .eq("status", "completed")
    .eq("payment_method", "card")
    .order("completed_at", { ascending: false })
    .limit(30);

  if (error || !rides?.length) return 0;

  let repaired = 0;
  for (const ride of rides) {
    const rideId = String(ride.id);
    const rideCurrency = String(ride.currency ?? currency);
    if (await cardTripSettlementExists(payClient, tables.journal, rideId)) continue;

    const result = await processCardTripSettlement(ridesDb, ride as Record<string, unknown>);
    if (result.ok && result.inserted > 0) {
      repaired += 1;
      console.info("[cardSettlement] repair_completed", {
        ride_id: rideId,
        driver_user_id: driverUserId,
        currency: rideCurrency,
      });
    }
  }

  return repaired;
}

/** Backfill card trips for a rider so wallet transaction history is complete. */
export async function repairMissingCardTripSettlementsForRider(
  ridesDb: SupabaseClient,
  riderUserId: string,
  currency = "JMD",
): Promise<number> {
  if (!isCashSettlementV2Enabled()) return 0;

  const { db: payClient, tables } = await getRidesPaymentDb();
  let rides: Array<Record<string, unknown>> | null = null;

  const { data: native, error: nativeErr } = await ridesDb
    .from("ride_requests")
    .select("id, status, payment_method, assigned_driver_user_id, rider_user_id, currency, fare_final_minor, fare_estimate_minor")
    .eq("rider_user_id", riderUserId)
    .eq("status", "completed")
    .eq("payment_method", "card")
    .order("completed_at", { ascending: false })
    .limit(30);

  if (!nativeErr && native?.length) {
    rides = native as Array<Record<string, unknown>>;
  } else {
    const { data: pub } = await pubSvc()
      .from("rides_ride_requests")
      .select("id, status, payment_method, assigned_driver_user_id, rider_user_id, currency, fare_final_minor, fare_estimate_minor")
      .eq("rider_user_id", riderUserId)
      .eq("status", "completed")
      .eq("payment_method", "card")
      .order("completed_at", { ascending: false })
      .limit(30);
    rides = (pub ?? []) as Array<Record<string, unknown>>;
  }

  if (!rides.length) return 0;

  let repaired = 0;
  for (const ride of rides) {
    const rideId = String(ride.id);
    const rideCurrency = String(ride.currency ?? currency);
    if (await cardTripSettlementExists(payClient, tables.journal, rideId)) continue;

    const result = await processCardTripSettlement(ridesDb, ride);
    if (result.ok && result.inserted > 0) {
      repaired += 1;
      console.info("[cardSettlement] rider_repair_completed", {
        ride_id: rideId,
        rider_user_id: riderUserId,
        currency: rideCurrency,
      });
    }
  }

  return repaired;
}
