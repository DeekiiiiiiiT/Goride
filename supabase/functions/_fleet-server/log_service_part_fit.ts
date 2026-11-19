/**
 * Slice C — chosen line part must fit the car (LC-01).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { partFitsCatalogIds, verifiedCarForVehicle } from "./fleet_parts_access.ts";
import type { Context } from "npm:hono@4.3.11";

function parsePartId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const id = String(raw).trim();
  return id || null;
}

export async function loadExistingLineParts(
  supabase: SupabaseClient,
  workOrderId: string,
): Promise<Map<string, { part_id: string | null; component_name: string | null }>> {
  const { data, error } = await supabase
    .from("maintenance_work_order_lines")
    .select("id, part_id, component_name")
    .eq("work_order_id", workOrderId)
    .is("voided_at", null);
  if (error) throw error;
  const out = new Map<string, { part_id: string | null; component_name: string | null }>();
  for (const row of data ?? []) {
    const r = row as { id: string; part_id?: string | null; component_name?: string | null };
    out.set(String(r.id), {
      part_id: r.part_id != null ? String(r.part_id) : null,
      component_name: r.component_name != null ? String(r.component_name) : null,
    });
  }
  return out;
}


/**
 * The one part-fit rule (LC-01) for every path that stores a part on a job: a car with no verified catalogue link is
 * not checked (Roam can't tell what fits it, and today's saves on such cars must keep working — rule 11); a linked car
 * only takes parts listed for it.
 */
export async function partFitsVerifiedCar(
  supabase: SupabaseClient,
  catalogId: string | null,
  partId: string,
): Promise<boolean> {
  if (!catalogId) return true;
  return partFitsCatalogIds(supabase, partId, [catalogId]);
}

/**
 * Lines whose part must be checked: a new or changed part on a done line. A not-done-yet line (recommended) never
 * stores a part (mapApiLineToDb clears it), so it is never refused over one (code review #5).
 */
export function linesNeedingPartFit(
  rawLines: unknown[],
  existingByLineId?: Map<string, { part_id: string | null; component_name: string | null }>,
): Array<{ partId: string; jobName: string }> {
  const out: Array<{ partId: string; jobName: string }> = [];
  for (const raw of rawLines) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as Record<string, unknown>;
    if (line.recommended === true) continue;
    const partId = parsePartId(line.partId ?? line.part_id);
    if (!partId) continue;
    const lineId = line.id != null ? String(line.id).trim() : "";
    const prev = existingByLineId && lineId ? existingByLineId.get(lineId) : undefined;
    if (prev && prev.part_id === partId) continue;
    out.push({
      partId,
      jobName: String(line.componentName ?? line.component_name ?? line.categoryName ?? prev?.component_name ?? "This job"),
    });
  }
  return out;
}

export async function validateLinePartFitOnSave(
  c: Context,
  supabase: SupabaseClient,
  _orgId: string,
  vehicleId: string,
  rawLines: unknown[],
  existingByLineId?: Map<string, { part_id: string | null; component_name: string | null }>,
): Promise<{ ok: true } | { ok: false; status: number; code: string; error: string }> {
  const toCheck = linesNeedingPartFit(rawLines, existingByLineId);
  if (!toCheck.length) return { ok: true };
  const access = await verifiedCarForVehicle(c, supabase, vehicleId);
  if (access.status !== 200) return { ok: true };
  // One check per distinct part, all at once (code review #9).
  const distinct = [...new Set(toCheck.map((l) => l.partId))];
  const fits = await Promise.all(distinct.map((id) => partFitsVerifiedCar(supabase, access.catalogId ?? null, id)));
  const bad = new Set(distinct.filter((_, i) => !fits[i]));
  const first = toCheck.find((l) => bad.has(l.partId));
  if (!first) return { ok: true };
  return {
    ok: false,
    status: 400,
    code: "line_part_not_for_car",
    error: `${first.jobName}: that part does not fit this car.`,
  };
}
