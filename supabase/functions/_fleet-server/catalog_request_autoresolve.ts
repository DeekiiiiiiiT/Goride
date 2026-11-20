/**
 * LC-21c (owner 20 Nov): adding a part in Dominion closes the Pending catalog requests it answers — no hand closing.
 * docs/log-service-parts-gaps-audit.md 0c4.
 *
 * After any Add parts save (its batch), for each part saved:
 *  - a request from a service log ("Add … as the battery I used") closes when what the user typed contains the
 *    part's number (letters / digits only, ≥ 4) — the same job;
 *  - an ask for a car (Find parts / Ask Roam) closes when the part is now listed for that car (part_listing).
 * Closing uses catalog_resolve_request_group (it skips the "now on file" notice for service-log requests).
 * Best effort: a failure never fails the save.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { partFitsCatalogIds } from "./fleet_parts_access.ts";
import { normText } from "./fleet_parts_match.ts";

export type SavedPart = { id: string; componentId: string; number: string };
export type OpenRequest = {
  groupKey: string;
  componentId: string;
  origin: string;
  needText: string;
  vehicleCatalogId: string | null;
};

/** The service-log rule: the typed text holds the part's number (hyphens / spaces ignored). */
export function typedTextNamesPart(needText: string, partNumber: string): boolean {
  const num = normText(partNumber);
  return num.length >= 4 && normText(needText).includes(num);
}

/** Which open groups each saved part answers (service-log text match; car asks need `fitsCar`). */
export async function groupsToResolve(
  parts: SavedPart[],
  requests: OpenRequest[],
  fitsCar: (partId: string, vehicleCatalogId: string) => Promise<boolean>,
): Promise<Array<{ groupKey: string; partId: string }>> {
  const out: Array<{ groupKey: string; partId: string }> = [];
  const done = new Set<string>();
  for (const part of parts) {
    for (const r of requests) {
      if (done.has(r.groupKey) || r.componentId !== part.componentId) continue;
      const hit = r.origin === "service_log"
        ? typedTextNamesPart(r.needText, part.number)
        : Boolean(r.vehicleCatalogId) && await fitsCar(part.id, r.vehicleCatalogId!);
      if (!hit) continue;
      done.add(r.groupKey);
      out.push({ groupKey: r.groupKey, partId: part.id });
    }
  }
  return out;
}

export async function autoResolveFromBatch(
  supabase: SupabaseClient,
  batchId: string,
  actorId: string | null,
): Promise<number> {
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) return 0;
  try {
    const { data: changes, error: chErr } = await supabase
      .from("part_import_change")
      .select("row_id")
      .eq("batch_id", batchId)
      .eq("table_name", "part_master");
    if (chErr) throw chErr;
    const ids = [...new Set((changes ?? []).map((r) => String((r as { row_id?: string }).row_id ?? "")).filter(Boolean))];
    if (!ids.length) return 0;
    const { data: pm, error: pmErr } = await supabase
      .from("part_master")
      .select("id, maintenance_component_id, oem_part_number")
      .in("id", ids);
    if (pmErr) throw pmErr;
    const parts: SavedPart[] = ((pm ?? []) as Array<Record<string, unknown>>)
      .filter((r) => r.maintenance_component_id)
      .map((r) => ({ id: String(r.id), componentId: String(r.maintenance_component_id), number: String(r.oem_part_number ?? "") }));
    if (!parts.length) return 0;
    const { data: reqs, error: rqErr } = await supabase
      .from("parts_sourcing_requests")
      .select("research_group_key, maintenance_component_id, origin, need_text, vehicle_catalog_id")
      .eq("kind", "add_part_info")
      .in("status", ["open", "in_progress"])
      .in("maintenance_component_id", [...new Set(parts.map((p) => p.componentId))])
      .not("research_group_key", "is", null)
      .limit(500);
    if (rqErr) throw rqErr;
    const requests: OpenRequest[] = ((reqs ?? []) as Array<Record<string, unknown>>).map((r) => ({
      groupKey: String(r.research_group_key),
      componentId: String(r.maintenance_component_id),
      origin: String(r.origin ?? ""),
      needText: String(r.need_text ?? ""),
      vehicleCatalogId: r.vehicle_catalog_id ? String(r.vehicle_catalog_id) : null,
    }));
    const todo = await groupsToResolve(parts, requests, (partId, carId) => partFitsCatalogIds(supabase, partId, [carId]));
    let resolved = 0;
    for (const t of todo) {
      const { error } = await supabase.rpc("catalog_resolve_request_group", {
        p_group_key: t.groupKey,
        p_part_id: t.partId,
        p_actor_id: actorId && /^[0-9a-f-]{36}$/i.test(actorId) ? actorId : null,
      });
      if (error) throw error;
      resolved += 1;
    }
    return resolved;
  } catch (e) {
    console.error("[autoResolveFromBatch] skipped:", batchId, e instanceof Error ? e.message : String(e));
    return 0;
  }
}
