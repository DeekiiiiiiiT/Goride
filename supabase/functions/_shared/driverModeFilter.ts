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
    .select("user_id, mode, status")
    .in("user_id", unique)
    .eq("status", "active");

  if (dispatchSettings.independent_only_matching) {
    query = query.eq("mode", "independent");
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
): Promise<boolean> {
  const eligible = await getEligibleDriverUserIds([userId], dispatchSettings);
  return eligible.has(userId);
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
