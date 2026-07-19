/**
 * Rider verification PINs live in rides.ride_pins — never on ride_requests —
 * so Realtime postgres_changes cannot broadcast them to drivers.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeVerificationPin } from "./fare/pinVerification.ts";

export async function loadRidePin(
  db: SupabaseClient,
  rideId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("ride_pins")
    .select("verification_pin")
    .eq("ride_request_id", rideId)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeVerificationPin((data as { verification_pin?: string }).verification_pin);
}

export async function upsertRidePin(
  db: SupabaseClient,
  rideId: string,
  pin: string,
): Promise<boolean> {
  const normalized = normalizeVerificationPin(pin);
  if (!normalized) return false;
  const { error } = await db.from("ride_pins").upsert(
    {
      ride_request_id: rideId,
      verification_pin: normalized,
    },
    { onConflict: "ride_request_id" },
  );
  return !error;
}

/** Attach verification_pin onto a ride row from ride_pins (in-memory only). */
export async function attachRidePin(
  db: SupabaseClient,
  ride: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = String(ride.id ?? "");
  if (!id) return ride;
  if (normalizeVerificationPin(ride.verification_pin)) return ride;
  const pin = await loadRidePin(db, id);
  if (!pin) return ride;
  return { ...ride, verification_pin: pin };
}
