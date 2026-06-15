/**
 * Driver Offer CRUD Operations
 *
 * All writes to rides.driver_offers table.
 * Uses RPC functions with direct query fallback.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface DriverOffer {
  id: string;
  ride_request_id: string;
  driver_user_id: string;
  wave: number;
  rank_score: number;
  distance_km: number;
  status: "pending" | "accepted" | "declined" | "expired" | "superseded";
  expires_at: string;
  created_at: string;
}

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "rides" } },
  );
}

function pubSvc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ svc: "matching", ts: new Date().toISOString(), ...payload }));
}

/**
 * Insert a new driver offer row.
 */
export async function insertDriverOfferRow(
  row: {
    ride_request_id: string;
    driver_user_id: string;
    wave: number;
    rank_score: number;
    distance_km: number;
    status: "pending";
    expires_at: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { error: rpcError } = await pubSvc().rpc("rides_insert_driver_offer", { p_row: row });
  if (!rpcError) return { ok: true };

  const { error } = await svc().from("driver_offers").insert(row);
  if (!error) {
    logLine({
      event: "insert_offer_via_fallback",
      ride_request_id: row.ride_request_id,
      rpc_error: rpcError.message,
    });
    return { ok: true };
  }

  const msg = [rpcError.message, error.message].filter(Boolean).join(" | ");
  logLine({
    event: "insert_offer_failed",
    ride_request_id: row.ride_request_id,
    error: error.message,
    rpc_error: rpcError.message,
  });
  return { ok: false, error: msg };
}

/**
 * Update a driver offer row.
 */
export async function patchDriverOfferRow(
  id: string,
  patch: Partial<Pick<DriverOffer, "status">>,
): Promise<boolean> {
  const { error: rpcError } = await pubSvc().rpc("rides_patch_driver_offer", {
    p_id: id,
    p_patch: patch,
  });
  if (!rpcError) return true;

  const { error } = await svc().from("driver_offers").update(patch).eq("id", id);
  return !error;
}

/**
 * Expire pending offers for a ride that have passed their expiration time.
 */
export async function expirePendingOffersForRide(rideId: string, nowIso: string): Promise<void> {
  const { error: rpcError } = await pubSvc().rpc("rides_expire_pending_offers", {
    p_ride_id: rideId,
    p_now: nowIso,
  });
  if (!rpcError) return;

  await svc()
    .from("driver_offers")
    .update({ status: "expired" })
    .eq("ride_request_id", rideId)
    .eq("status", "pending")
    .lte("expires_at", nowIso);
}

/**
 * Supersede all pending offers for a ride, except optionally one.
 */
export async function supersedePendingOffersForRide(
  rideId: string,
  exceptOfferId?: string,
): Promise<void> {
  const { error: rpcError } = await pubSvc().rpc("rides_supersede_pending_offers", {
    p_ride_id: rideId,
    p_except_offer_id: exceptOfferId ?? null,
  });
  if (!rpcError) return;

  let query = svc()
    .from("driver_offers")
    .update({ status: "superseded" })
    .eq("ride_request_id", rideId)
    .eq("status", "pending");

  if (exceptOfferId) query = query.neq("id", exceptOfferId);
  await query;
}

/**
 * Supersede all pending offers for a driver (when they accept another ride).
 */
export async function supersedeAllPendingOffersForDriver(driverUserId: string): Promise<void> {
  await svc()
    .from("driver_offers")
    .update({ status: "superseded" })
    .eq("driver_user_id", driverUserId)
    .eq("status", "pending");
}

/**
 * Load all driver offers for a ride.
 */
export async function loadDriverOffersForRide(
  rideId: string,
  orderDesc = true,
): Promise<DriverOffer[]> {
  let query = svc().from("driver_offers").select("*").eq("ride_request_id", rideId);
  if (orderDesc) query = query.order("created_at", { ascending: false });
  const { data: native, error: nativeErr } = await query;
  if (!nativeErr && native) return native as DriverOffer[];

  let pubQuery = pubSvc().from("rides_driver_offers").select("*").eq("ride_request_id", rideId);
  if (orderDesc) pubQuery = pubQuery.order("created_at", { ascending: false });
  const { data: pub } = await pubQuery;
  return (pub ?? []) as DriverOffer[];
}

/**
 * Load a single driver offer by ID.
 */
export async function loadDriverOfferById(offerId: string): Promise<DriverOffer | null> {
  const { data: native, error: nativeErr } = await svc()
    .from("driver_offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();
  if (!nativeErr && native) return native as DriverOffer;

  const { data: pub } = await pubSvc()
    .from("rides_driver_offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();
  return (pub as DriverOffer | null) ?? null;
}

/**
 * Count pending offers for a ride.
 */
export async function countPendingOffersForRide(rideId: string): Promise<number> {
  const offers = await loadDriverOffersForRide(rideId, false);
  return offers.filter((o) => o.status === "pending").length;
}

/**
 * Get excluded driver IDs (declined, expired, superseded offers).
 */
export async function getExcludedDriverIds(rideId: string): Promise<Set<string>> {
  const offers = await loadDriverOffersForRide(rideId, false);
  const excluded = new Set<string>();

  for (const offer of offers) {
    if (["declined", "expired", "superseded"].includes(offer.status)) {
      excluded.add(offer.driver_user_id);
    }
  }

  return excluded;
}
