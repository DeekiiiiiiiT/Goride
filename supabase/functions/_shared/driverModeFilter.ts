/**
 * Filter driver candidates by driver_profiles mode and status.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { DispatchSettings } from "../rides/fare/dispatchSettings.ts";

function publicDb(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export async function getEligibleDriverUserIds(
  userIds: string[],
  dispatchSettings: Pick<DispatchSettings, "independent_only_matching">,
): Promise<Set<string>> {
  if (!userIds.length) return new Set();

  const unique = [...new Set(userIds)];
  const db = publicDb();
  let query = db
    .from("driver_profiles")
    .select("user_id, mode, status, dispatch_pilot")
    .in("user_id", unique)
    .eq("status", "active");

  if (dispatchSettings.independent_only_matching) {
    // Staged rollout: pilot-flagged fleet drivers stay in the pool.
    query = query.or("mode.eq.independent,dispatch_pilot.eq.true");
  }

  const { data, error } = await query;
  if (error) {
    console.warn("getEligibleDriverUserIds failed", error.message);
    return new Set();
  }

  return new Set((data ?? []).map((row: { user_id: string }) => row.user_id));
}

export async function isDriverEligibleForDispatch(
  userId: string,
  dispatchSettings: Pick<DispatchSettings, "independent_only_matching">,
): Promise<{ eligible: boolean; reason?: string }> {
  const db = publicDb();
  const { data, error } = await db
    .from("driver_profiles")
    .select("user_id, mode, status, dispatch_pilot")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("isDriverEligibleForDispatch lookup failed", error.message);
    return { eligible: false, reason: "profile_lookup_failed" };
  }
  if (!data) return { eligible: false, reason: "no_driver_profile" };
  if (data.status !== "active") return { eligible: false, reason: "driver_not_active" };

  const isPilot = data.dispatch_pilot === true;
  if (dispatchSettings.independent_only_matching && data.mode !== "independent" && !isPilot) {
    return { eligible: false, reason: "fleet_not_eligible_for_dispatch" };
  }

  // Fleet drivers must have an assigned fleet vehicle before going online so
  // rides carry correct vehicle attribution into fleet books/analytics.
  if (data.mode === "fleet") {
    const { getFleetDriverContext } = await import("./fleetDriverContext.ts");
    const ctx = await getFleetDriverContext(userId);
    if (!ctx.assignedVehicleId) {
      return { eligible: false, reason: "fleet_vehicle_not_assigned" };
    }
  }

  return { eligible: true };
}

export async function getDriverProfileMode(userId: string): Promise<string | null> {
  const db = publicDb();
  const { data } = await db
    .from("driver_profiles")
    .select("mode, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  return typeof data.mode === "string" ? data.mode : null;
}
