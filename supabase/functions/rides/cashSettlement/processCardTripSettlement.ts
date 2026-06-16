import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCardTripJournalLines } from "./buildCardTripJournal.ts";
import { isCashSettlementV2Enabled } from "./flags.ts";
import { postPaymentJournal } from "../../_shared/paymentAccounts.ts";
import { getRidesPaymentDb } from "../../_shared/ridesPaymentDb.ts";
import { resolveOwedFareMinor } from "./processCashSettlement.ts";

export function isCardTripRide(ride: Record<string, unknown>): boolean {
  return String(ride.payment_method ?? "") === "card";
}

async function hashCardTripSettlement(rideId: string, fareMinor: number): Promise<string> {
  const normalized = JSON.stringify({
    ride_request_id: rideId,
    fare_minor: Math.floor(Number(fareMinor) || 0),
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
  if (!driverUserId) {
    return { ok: false, reason: "no_driver" };
  }

  const fareMinor = resolveOwedFareMinor(ride);
  if (fareMinor == null || fareMinor <= 0) {
    return { ok: false, reason: "no_fare" };
  }

  const currency = String(ride.currency ?? "JMD");
  const lines = buildCardTripJournalLines({
    rideId,
    currency,
    driverUserId,
    fareMinor,
  });
  if (lines.length === 0) {
    return { ok: false, reason: "no_lines" };
  }

  const idempotencyKey = `card-settlement-${rideId}`;
  const requestHash = await hashCardTripSettlement(rideId, fareMinor);

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
    .select("id, status, payment_method, assigned_driver_user_id, currency, fare_final_minor, fare_estimate_minor")
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
    const { data: existing } = await payClient
      .from(tables.journal)
      .select("id")
      .eq("ride_request_id", rideId)
      .eq("entry_type", "card_trip_digital_credit")
      .maybeSingle();
    if (existing?.id) continue;

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
