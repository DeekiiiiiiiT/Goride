import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";

type RoamMode = "open_roam" | "shadow_roam";

function isValidRoamMode(value: unknown): value is RoamMode {
  return value === "open_roam" || value === "shadow_roam";
}

/**
 * ride_requests.roam_mode is missing when rides_create_ride_request RPC omits the column.
 * Fall back to linked booking_requests.roam_mode and persist on the ride row.
 */
export async function enrichRideRoamModeFromBooking(
  ride: Record<string, unknown>,
  getContactsDb: () => Promise<RidesContactsDb>,
  rideDb?: SupabaseClient,
): Promise<Record<string, unknown>> {
  if (isValidRoamMode(ride.roam_mode)) return ride;

  const bookingRequestId = ride.booking_request_id;
  if (typeof bookingRequestId !== "string" || !bookingRequestId) return ride;

  const { db, tables: t } = await getContactsDb();
  const { data: br } = await db.from(t.booking_requests)
    .select("roam_mode")
    .eq("id", bookingRequestId)
    .maybeSingle();

  const resolved = br?.roam_mode;
  if (!isValidRoamMode(resolved)) return ride;

  const rideId = ride.id;
  if (rideDb && rideId) {
    await rideDb.from("ride_requests").update({ roam_mode: resolved }).eq("id", String(rideId));
  }

  return { ...ride, roam_mode: resolved };
}
