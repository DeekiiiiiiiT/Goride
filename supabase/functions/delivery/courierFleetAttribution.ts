/**
 * Resolve fleet org id for a courier at order assignment time.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function resolveCourierFleetId(
  serviceSb: SupabaseClient,
  courierUserId: string,
): Promise<string | null> {
  const { data: courierProf } = await serviceSb
    .schema("delivery")
    .from("courier_profiles")
    .select("fleet_id, mode")
    .eq("user_id", courierUserId)
    .maybeSingle();

  if (courierProf?.mode === "fleet" && courierProf?.fleet_id) {
    return String(courierProf.fleet_id);
  }
  return null;
}

/** Fields to merge when assigning a courier to an order. */
export async function courierAssignmentFields(
  serviceSb: SupabaseClient,
  courierUserId: string,
): Promise<{ courier_id: string; courier_fleet_id: string | null }> {
  const fleetId = await resolveCourierFleetId(serviceSb, courierUserId);
  return {
    courier_id: courierUserId,
    courier_fleet_id: fleetId,
  };
}
