import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fleetDb } from "./repos/baseRepo.ts";

function formatInterval(km: number | null, mo: number | null): string {
  const parts: string[] = [];
  if (km != null) parts.push(`${km.toLocaleString("en-US")} km`);
  if (mo != null) parts.push(`${mo} months`);
  if (!parts.length) return "—";
  return parts.join(" or ");
}

const AS_NEEDED_REASON = "As needed: done only when a job calls for it";

/** The printed page of the car maker's document a rule came from (PDF page − the manual's offset). */
export function sourcePage(
  rule: Record<string, unknown> | undefined,
  manualsById: Map<string, { page_offset: number; doc_type: string | null }>,
): { page: number; doc: "owners_manual" | "schedule" } | null {
  if (!rule || rule.evidence_page == null) return null;
  const pdfPage = Number(rule.evidence_page);
  if (!Number.isFinite(pdfPage)) return null;
  const manual = rule.manual_id ? manualsById.get(String(rule.manual_id)) : undefined;
  const printed = pdfPage - (manual?.page_offset ?? 0);
  return {
    page: printed >= 1 ? printed : pdfPage,
    doc: manual?.doc_type === "owners_manual" ? "owners_manual" : "schedule",
  };
}

/**
 * Where the clock started for one part: a logged service, history a person filled in, or the car's first
 * odometer reading. Null fields when nobody knows (History unknown).
 */
export function countingFrom(sched: Record<string, unknown> | undefined): {
  counting_from_km: number | null;
  counting_from_date: string | null;
  counting_from_source: "service" | "filled_in" | "first_reading" | null;
} {
  if (!sched) return { counting_from_km: null, counting_from_date: null, counting_from_source: null };
  const lastKm = sched.last_performed_km != null ? Number(sched.last_performed_km) : null;
  const lastDate = sched.last_performed_date != null ? String(sched.last_performed_date).slice(0, 10) : null;
  if (lastKm != null || lastDate != null) {
    return {
      counting_from_km: lastKm,
      counting_from_date: lastDate,
      counting_from_source: sched.last_performed_source === "manual" ? "filled_in" : "service",
    };
  }
  return { counting_from_km: null, counting_from_date: null, counting_from_source: null };
}

export async function enrichMaintenanceDueItems(
  supabase: SupabaseClient,
  orgId: string,
  vehicleId: string,
  items: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const { data: veh } = await fleetDb()
    .from("fleet_vehicles")
    .select("severe_duty")
    .eq("organization_id", orgId)
    .eq("id", vehicleId)
    .maybeSingle();

  const { data: schedules } = await supabase
    .from("vehicle_component_schedule")
    .select(
      "id, category_id, position, schedule_status, retired_reason, rule_id, rule_revision_no, interval_km_used, interval_months_used, interval_basis, custom_interval_km, custom_interval_months, custom_reason, custom_set_at, computed_at, last_performed_km, last_performed_date, last_performed_source, baseline_odometer, baseline_date, baseline_source, history_check_at_next_service, category:maintenance_service_categories(id, code, name)",
    )
    .eq("organization_id", orgId)
    .eq("vehicle_id", vehicleId);

  const ruleIds = [...new Set((schedules || []).map((s) => s.rule_id).filter(Boolean))] as string[];
  const rulesById = new Map<string, Record<string, unknown>>();
  if (ruleIds.length) {
    const { data: rules } = await supabase
      .from("maintenance_task_templates")
      .select("id, source_type, status, template_scope, interval_km, interval_months, severe_interval_km, severe_interval_months, updated_at, task_name, manual_id, evidence_page")
      .in("id", ruleIds);
    for (const r of rules || []) rulesById.set(String(r.id), r as Record<string, unknown>);
  }

  // Step 10: "Car maker · page 412" — the printed page of the manual a rule came from.
  const manualIds = [...new Set([...rulesById.values()].map((r) => r.manual_id).filter(Boolean))] as string[];
  const manualsById = new Map<string, { page_offset: number; doc_type: string | null }>();
  if (manualIds.length) {
    const { data: manuals } = await supabase
      .from("maintenance_manual")
      .select("id, page_offset, doc_type")
      .in("id", manualIds);
    for (const m of manuals || []) {
      manualsById.set(String(m.id), { page_offset: Number(m.page_offset ?? 0), doc_type: m.doc_type ?? null });
    }
  }

  const schedKey = (cat: unknown, pos: unknown) => `${String(cat)}::${pos == null || pos === "" ? "-" : String(pos)}`;
  const schedMap = new Map<string, Record<string, unknown>>();
  for (const s of schedules || []) {
    schedMap.set(schedKey(s.category_id, s.position), s as Record<string, unknown>);
  }

  const enrichOne = (row: Record<string, unknown>) => {
    const cat = row.category_id ?? row.categoryId;
    const pos = row.position;
    const sched = schedMap.get(schedKey(cat, pos));
    const rule = sched?.rule_id ? rulesById.get(String(sched.rule_id)) : undefined;
    const kmUsed = sched?.interval_km_used != null ? Number(sched.interval_km_used) : null;
    const moUsed = sched?.interval_months_used != null ? Number(sched.interval_months_used) : null;
    const severe = Boolean(veh?.severe_duty);
    let kmDisplay = kmUsed;
    let moDisplay = moUsed;
    if (rule) {
      if (kmDisplay == null) {
        if (severe && rule.severe_interval_km != null) kmDisplay = Number(rule.severe_interval_km);
        else if (rule.interval_km != null) kmDisplay = Number(rule.interval_km);
      }
      if (moDisplay == null) {
        if (severe && rule.severe_interval_months != null) moDisplay = Number(rule.severe_interval_months);
        else if (rule.interval_months != null) moDisplay = Number(rule.interval_months);
      }
    }
    const sourceType = rule?.source_type != null ? String(rule.source_type) : "roam_policy";
    const scopeLabel =
      rule?.template_scope === "global"
        ? "Everyone"
        : rule?.template_scope != null
          ? String(rule.template_scope).replace(/_/g, " ")
          : "Everyone";
    const updatedAt = sched?.computed_at ?? rule?.updated_at;
    const catJoin = sched?.category as { name?: string; code?: string } | null | undefined;
    return {
      ...row,
      category_name: row.category_name ?? catJoin?.name ?? rule?.task_name,
      category_code: row.category_code ?? catJoin?.code,
      severe_duty: Boolean(veh?.severe_duty),
      source_type: sourceType,
      schedule_status: sched?.schedule_status ?? row.due_status,
      interval_km_used: kmUsed,
      interval_months_used: moUsed,
      interval_sentence: formatInterval(kmDisplay, moDisplay),
      scope_label: scopeLabel,
      needs_checking: rule?.status === "needs_checking",
      custom_interval_km: sched?.custom_interval_km ?? null,
      custom_interval_months: sched?.custom_interval_months ?? null,
      custom_reason: sched?.custom_reason ?? null,
      custom_set_at: sched?.custom_set_at ?? null,
      interval_basis: sched?.interval_basis ?? null,
      updated_by_roam_at: updatedAt ?? null,
      odometer_needed: row.due_status === "odometer_needed" || sched?.schedule_status === "odometer_needed",
      // Step 10 (B5, MER-18): where the number comes from, where the clock started, why a part was retired.
      schedule_id: sched?.id ?? null,
      retired_reason: sched?.retired_reason ?? null,
      source_page: sourcePage(rule, manualsById),
      ...countingFrom(sched),
    };
  };

  const dueKeys = new Set(items.map((row) => schedKey(row.category_id ?? row.categoryId, row.position)));
  // Step 10 (MER-04 display): an as-needed part (done only when a job calls for it) is never a due line.
  const enrichedDue = items
    .map(enrichOne)
    .filter((row) => String(row.retired_reason ?? "") !== AS_NEEDED_REASON);

  const retiredExtras: Record<string, unknown>[] = [];
  for (const s of schedules || []) {
    if (String(s.schedule_status ?? "") !== "retired") continue;
    if (String(s.retired_reason ?? "") === AS_NEEDED_REASON) continue;
    const key = schedKey(s.category_id, s.position);
    if (dueKeys.has(key)) continue;
    const catJoin = s.category as { name?: string; code?: string } | null | undefined;
    retiredExtras.push(
      enrichOne({
        category_id: s.category_id,
        position: s.position,
        category_name: catJoin?.name ?? "Service",
        category_code: catJoin?.code,
        due_status: "ok",
      }),
    );
  }

  return [...enrichedDue, ...retiredExtras];
}

export type DominionScheduleStatus = "roam_policy" | "maker_manual" | "needs_checking" | "waiting_odometer";

export function computeDominionScheduleStatus(
  compRows: Record<string, unknown>[],
  rulesById: Map<string, Record<string, unknown>>,
  hasOdometerReading: boolean,
): DominionScheduleStatus {
  let needsChecking = false;
  let maker = false;
  let waitingOdo = false;
  for (const s of compRows) {
    const st = String(s.schedule_status ?? "active");
    if (st === "odometer_needed") waitingOdo = true;
    const ruleId = s.rule_id != null ? String(s.rule_id) : "";
    if (ruleId && rulesById.has(ruleId)) {
      const rule = rulesById.get(ruleId)!;
      if (String(rule.status ?? "") === "needs_checking") needsChecking = true;
      const src = String(rule.source_type ?? "");
      if (src === "maker_manual" || src === "part_maker") maker = true;
    }
  }
  if (needsChecking) return "needs_checking";
  if (!hasOdometerReading && waitingOdo) return "waiting_odometer";
  if (maker) return "maker_manual";
  return "roam_policy";
}

export async function fetchScheduleExplain(
  supabase: SupabaseClient,
  orgId: string,
  vehicleId: string,
  categoryId: string,
  position: string | null,
) {
  const { data: roamRows } = await supabase.rpc("schedule_rule_for_part", {
    p_org: orgId,
    p_vehicle_id: vehicleId,
    p_component_id: categoryId,
    p_position: position,
    p_include_custom: false,
  });
  const roam = Array.isArray(roamRows) ? roamRows[0] : roamRows;
  const { data: rule } = roam?.rule_id
    ? await supabase.from("maintenance_task_templates").select("*").eq("id", roam.rule_id).maybeSingle()
    : { data: null };

  const { data: sched } = await supabase
    .from("vehicle_component_schedule")
    .select("*")
    .eq("organization_id", orgId)
    .eq("vehicle_id", vehicleId)
    .eq("category_id", categoryId)
    .maybeSingle();

  const scopeLabel =
    rule?.template_scope === "global" ? "Everyone" : rule?.template_scope ? String(rule.template_scope) : "Everyone";

  return {
    category_id: categoryId,
    position,
    scope_label: scopeLabel,
    source_type: rule?.source_type ?? "roam_policy",
    interval_km: roam?.interval_km ?? rule?.interval_km ?? null,
    interval_months: roam?.interval_months ?? rule?.interval_months ?? null,
    interval_sentence: formatInterval(
      roam?.interval_km != null ? Number(roam.interval_km) : rule?.interval_km != null ? Number(rule.interval_km) : null,
      roam?.interval_months != null ? Number(roam.interval_months) : rule?.interval_months != null ? Number(rule.interval_months) : null,
    ),
    last_changed_at: rule?.updated_at ?? null,
    counting_from_km: sched?.baseline_odometer ?? sched?.last_performed_km ?? null,
    counting_from_date: sched?.baseline_date ?? sched?.last_performed_date ?? null,
    custom_interval_km: sched?.custom_interval_km ?? null,
    custom_interval_months: sched?.custom_interval_months ?? null,
    custom_reason: sched?.custom_reason ?? null,
    custom_set_at: sched?.custom_set_at ?? null,
  };
}
