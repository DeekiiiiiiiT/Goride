/**
 * Load active Rush Pass membership + plan for a customer.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function loadActiveRushPassMembership(
  sb: SupabaseClient,
  customerId: string,
  now = new Date(),
): Promise<{ membership: Record<string, unknown>; plan: Record<string, unknown> } | null> {
  const nowIso = now.toISOString();
  const { data: membership } = await sb
    .from("rush_pass_memberships")
    .select("*, plan:rush_pass_plans(*)")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .lte("current_period_start", nowIso)
    .gt("current_period_end", nowIso)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership) return null;
  const row = membership as Record<string, unknown>;
  const planEmbed = row.plan as Record<string, unknown> | Record<string, unknown>[] | null;
  const plan = Array.isArray(planEmbed) ? planEmbed[0] : planEmbed;
  if (!plan) return null;
  return { membership: row, plan };
}
