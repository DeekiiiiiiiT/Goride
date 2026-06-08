import { quoteTokenHash, verifyQuoteToken } from "./fare/quoteToken.ts";
import { generatePin } from "./fare/pinVerification.ts";
import type { DispatchSettings } from "./fare/dispatchSettings.ts";

export type FulfillRideDeps = {
  svc: () => ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>;
  pubSvc: () => ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>;
  loadRideRequestById: (id: string) => Promise<Record<string, unknown> | null>;
  patchRideRequest: (id: string, patch: Record<string, unknown>) => Promise<void>;
  runMatchingWave: (
    rideId: string,
    ride: Record<string, unknown>,
    wave: number,
    reqId: string,
  ) => Promise<void>;
  reconcileMatching: (rideId: string, reqId: string) => Promise<void>;
  audit: (
    rideId: string | null,
    actor: string | undefined,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  gridCellKey: (lat: number, lng: number) => string;
  bumpSurgeDemand: (cellKey: string, delta: number) => Promise<void>;
  cancelPriorMatchingRidesForRider: (riderId: string, reason: string) => Promise<void>;
  bookDispatchSettings: DispatchSettings;
  isPinFeatureEnabled: (settings: DispatchSettings) => boolean;
  notifyPassengerBooked: (ride: Record<string, unknown>) => void;
};

const AVG_SPEED_KMH = 25;

export async function createRideFromTripIntent(
  deps: FulfillRideDeps,
  bookerUserId: string,
  intent: Record<string, unknown>,
  paymentMethod: string,
): Promise<Record<string, unknown>> {
  const pickup_lat = Number(intent.pickup_lat);
  const pickup_lng = Number(intent.pickup_lng);
  const dropoff_lat = Number(intent.dropoff_lat);
  const dropoff_lng = Number(intent.dropoff_lng);
  const vehicle_option = String(intent.vehicle_option ?? "uberx");
  const quote_token = String(intent.quote_token);

  const verified = await verifyQuoteToken(quote_token, {
    pickup_lat,
    pickup_lng,
    dropoff_lat,
    dropoff_lng,
    vehicle_type: vehicle_option,
  });
  if (!verified.ok) {
    throw new Error(`quote_stale:${verified.reason}`);
  }

  const locked = verified.payload;
  const cellKey = deps.gridCellKey(pickup_lat, pickup_lng);
  await deps.cancelPriorMatchingRidesForRider(bookerUserId, "replaced_by_new_booking");
  await deps.bumpSurgeDemand(cellKey, 1);

  const insertRow: Record<string, unknown> = {
    rider_user_id: bookerUserId,
    status: "matching",
    pickup_lat,
    pickup_lng,
    pickup_address: intent.pickup_address ?? null,
    dropoff_lat,
    dropoff_lng,
    dropoff_address: intent.dropoff_address ?? null,
    vehicle_option,
    fare_estimate_minor: locked.fare_estimate_minor,
    surge_multiplier: locked.surge_multiplier,
    currency: locked.currency,
    distance_estimate_km: locked.distance_km,
    duration_estimate_minutes: locked.duration_minutes,
    eta_pickup_seconds_estimate: Math.round((locked.distance_km / AVG_SPEED_KMH) * 3600),
    quote_token_hash: quoteTokenHash(quote_token),
    fare_breakdown: locked.fare_breakdown ?? null,
    payment_method: paymentMethod,
    booking_request_id: intent.id,
    passenger_user_id: intent.requester_user_id,
    guest_passenger_name: intent.requester_name,
    guest_passenger_phone: intent.requester_phone,
    roam_mode: intent.roam_mode ?? "open_roam",
    verification_pin: deps.isPinFeatureEnabled(deps.bookDispatchSettings) ? generatePin() : null,
  };

  const db = deps.svc();
  const { data: rpcRide, error: rpcError } = await deps.pubSvc().rpc("rides_create_ride_request", {
    p_row: insertRow,
  });
  let ride: Record<string, unknown> | null = rpcRide as Record<string, unknown> | null;
  if (!ride) {
    const { data, error } = await db.from("ride_requests").insert(insertRow).select("*").single();
    if (error || !data) {
      throw new Error(rpcError?.message ?? error?.message ?? "insert_failed");
    }
    ride = data as Record<string, unknown>;
  }

  const reqId = crypto.randomUUID();
  await deps.audit(ride.id as string, bookerUserId, "ride_created", { trip_intent_id: intent.id });
  await deps.runMatchingWave(ride.id as string, ride, 1, reqId);
  await deps.reconcileMatching(ride.id as string, reqId);
  deps.notifyPassengerBooked(ride);
  return ride;
}
