/**
 * Fleet intake dedupe, daily cap, job enqueue (audit B2).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { pendingPartsGroupKey } from "./pending_parts_group.ts";

export const DAILY_REQUEST_LIMIT = 30;
export const DAILY_LIMIT_MESSAGE =
  "You've sent 30 requests today. Roam will pick up more tomorrow.";

export function researchGroupKeyFromRow(row: Record<string, unknown>): string {
  return pendingPartsGroupKey(row);
}

export function jamaicaDayStartUtc(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}T05:00:00.000Z`;
}

export async function countOrgRequestsToday(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const since = jamaicaDayStartUtc();
  const { count, error } = await supabase
    .from("parts_sourcing_requests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("kind", "add_part_info")
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

export async function findDedupedOpenRequest(
  supabase: SupabaseClient,
  orgId: string,
  groupKey: string,
) {
  const { data, error } = await supabase
    .from("parts_sourcing_requests")
    .select("*")
    .eq("organization_id", orgId)
    .eq("kind", "add_part_info")
    .eq("research_group_key", groupKey)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureCatalogResearchJob(
  supabase: SupabaseClient,
  row: {
    vehicle_catalog_id: string | null;
    maintenance_component_id: string | null;
    fit_descriptor: string | null;
    install_side: string | null;
    match_type: string | null;
  },
  groupKey: string,
): Promise<string | null> {
  const { data: existing, error: findErr } = await supabase
    .from("catalog_research_job")
    .select("id, fleet_count")
    .eq("group_key", groupKey)
    .in("state", ["queued", "researching", "checking", "needs_review", "auto_added"])
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing?.id) {
    await supabase
      .from("catalog_research_job")
      .update({ fleet_count: (existing.fleet_count || 1) + 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return String(existing.id);
  }

  const { data: created, error: insErr } = await supabase
    .from("catalog_research_job")
    .insert({
      job_type: "part",
      group_key: groupKey,
      vehicle_catalog_id: row.vehicle_catalog_id,
      maintenance_component_id: row.maintenance_component_id,
      fit_descriptor: row.fit_descriptor,
      match_type: row.match_type,
      fleet_count: 1,
      state: "queued",
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  const jobId = String(created.id);
  const { error: qErr } = await supabase.rpc("catalog_research_enqueue_job", { p_job_id: jobId });
  if (qErr) throw qErr;
  await supabase.rpc("catalog_research_log_event", {
    p_job_id: jobId,
    p_step: "enqueue",
    p_outcome: "queued",
    p_detail: { groupKey },
  });
  return jobId;
}
