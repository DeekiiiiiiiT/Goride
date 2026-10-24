/**
 * Workforce pause is the membership row, not the cash-pause flag.
 * A paused driver or courier cannot start new work. A trip already underway can finish.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type WorkforceServiceLine = "rideshare" | "rush_delivery";

const PAUSED_MESSAGE = "This fleet has paused you.";

function db() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export async function workforcePauseMessage(
  userId: string,
  serviceLine: WorkforceServiceLine,
): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await db()
    .from("fleet_workforce_memberships")
    .select("status")
    .eq("user_id", userId)
    .eq("service_line", serviceLine)
    .neq("status", "ended")
    .maybeSingle();
  if (error) {
    console.warn("[workforce] pause lookup failed", error.message);
    return null;
  }
  return data?.status === "paused" ? PAUSED_MESSAGE : null;
}

export async function pausedWorkforceUserIds(
  userIds: string[],
  serviceLine: WorkforceServiceLine,
): Promise<Set<string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return new Set();
  const { data, error } = await db()
    .from("fleet_workforce_memberships")
    .select("user_id")
    .in("user_id", unique)
    .eq("service_line", serviceLine)
    .eq("status", "paused");
  if (error) {
    console.warn("[workforce] pause list failed", error.message);
    return new Set();
  }
  return new Set((data || []).map((row: { user_id?: string }) => String(row.user_id || "")));
}
