/**
 * Fleet intake dedupe, daily cap, job enqueue (audit B2).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { researchGroupKeyV2 } from "./pending_parts_group.ts";

export const DAILY_REQUEST_LIMIT = 30;
export const DAILY_LIMIT_MESSAGE =
  "You've sent 30 requests today. Roam will pick up more tomorrow.";

export async function researchGroupKeyFromRow(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<string> {
  return researchGroupKeyV2(supabase, {
    vehicle_catalog_id: row.vehicle_catalog_id ? String(row.vehicle_catalog_id) : null,
    maintenance_component_id: row.maintenance_component_id ? String(row.maintenance_component_id) : null,
    fit_descriptor: row.fit_descriptor ? String(row.fit_descriptor) : null,
    install_side: row.install_side ? String(row.install_side) : null,
    match_type: row.match_type ? String(row.match_type) : null,
    position_scheme: row.position_scheme ? String(row.position_scheme) : null,
    position_codes: Array.isArray(row.position_codes) ? row.position_codes.map(String) : null,
    old_part_number: row.old_part_number ? String(row.old_part_number) : null,
    // Find parts never keys by its typed words: the v2 rewrite gave open requests and jobs no name, and "Brake pads" /
    // "brake pad front" must stay one request (code review #1). Only service-log items without a number use a name.
    name: "",
  });
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
    need_text: string;
    old_part_number?: string | null;
    vehicle_catalog_id: string | null;
    maintenance_component_id: string | null;
    fit_descriptor: string | null;
    install_side: string | null;
    match_type: string | null;
  },
  groupKey: string,
): Promise<string | null> {
  const cleanedPn = row.old_part_number
    ? String(row.old_part_number).replace(/[^A-Za-z0-9-]/g, "").slice(0, 80)
    : null;
  const { data, error } = await supabase.rpc("catalog_research_join_or_create_job", {
    p_group_key: groupKey,
    p_vehicle_catalog_id: row.vehicle_catalog_id,
    p_component_id: row.maintenance_component_id,
    p_fit_descriptor: row.fit_descriptor,
    p_match_type: row.match_type,
    p_requested_name: row.need_text,
    p_requested_part_number: cleanedPn || null,
    p_origin: "find_parts",
  });
  if (error) throw error;
  const jobId = (data as Record<string, unknown>)?.jobId;
  return jobId != null ? String(jobId) : null;
}