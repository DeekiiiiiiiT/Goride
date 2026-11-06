import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { analyzeMaintenanceScheduleRow } from "../../../packages/finance-core/src/maintenanceOverdueDetails.ts";
import { canonicalOdometerForVehicle } from "./canonical_vehicle_odometer.ts";
import { loadOrgDueSoonSettings, loadTrustedOdometerMap } from "./maintenance_logging_helpers.ts";

export type LogServicePackageCard = {
  templateId: string;
  label: string;
  intervalText: string | null;
  status: "overdue" | "due_soon" | "ok" | "mandatory";
  kmLabel: string | null;
  sortScore: number;
};

export type LogServiceSuggestedOp = {
  categoryId: string;
  categoryName: string;
  systemName: string | null;
  iconKey: string | null;
  status: "overdue" | "due_soon";
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function kmLabelForSchedule(
  status: "overdue" | "due_soon" | "ok",
  currentOdo: number,
  nextMiles: number | null,
  kmOverdue: number | null,
): string | null {
  if (status === "overdue" && kmOverdue != null && kmOverdue > 0) {
    return `+${Math.round(kmOverdue).toLocaleString()} km past`;
  }
  if (status === "due_soon" && nextMiles != null && currentOdo > 0 && nextMiles > currentOdo) {
    return `In ${Math.round(nextMiles - currentOdo).toLocaleString()} km`;
  }
  return null;
}

export async function buildLogServiceContext(args: {
  supabase: SupabaseClient;
  c: Context;
  orgId: string;
  vehicleId: string;
}): Promise<{
  vehicleId: string;
  odometer: number;
  packages: LogServicePackageCard[];
  suggestedOperations: LogServiceSuggestedOp[];
  inspectionPointCount: number;
}> {
  const { supabase, c, orgId, vehicleId } = args;
  const trustedOdo = await loadTrustedOdometerMap(orgId);
  const trusted = trustedOdo.get(vehicleId);
  const odo = trusted?.reading ?? await canonicalOdometerForVehicle(supabase, vehicleId, 0, c);
  const today = todayIso();
  const { dueSoonKm, dueSoonDays } = await loadOrgDueSoonSettings(orgId);

  const { data: schedules } = await supabase
    .from("vehicle_maintenance_schedule")
    .select("template_id, next_due_miles, next_due_miles_max, next_due_date, schedule_status")
    .eq("organization_id", orgId)
    .eq("vehicle_id", vehicleId);

  const templateIds = [
    ...new Set((schedules || []).map((s) => s.template_id).filter(Boolean)),
  ] as string[];

  const { data: tplRows } = templateIds.length
    ? await supabase
      .from("maintenance_task_templates")
      .select("id, task_name, is_mandatory")
      .in("id", templateIds)
    : { data: [] as Record<string, unknown>[] };

  const tplById = new Map<string, Record<string, unknown>>();
  for (const t of tplRows || []) tplById.set(String(t.id), t as Record<string, unknown>);

  const packages: LogServicePackageCard[] = [];
  for (const row of schedules || []) {
    const tid = String(row.template_id ?? "");
    if (!tid) continue;
    const tpl = tplById.get(tid);
    const label = String(tpl?.task_name ?? "").trim() || "Service";
    const intervalText: string | null = null;

    const nextMiles = row.next_due_miles != null ? Number(row.next_due_miles) : null;
    const nextMax = row.next_due_miles_max != null ? Number(row.next_due_miles_max) : null;
    const nextDate = row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null;
    const schSt = row.schedule_status != null ? String(row.schedule_status) : "active";
    const analysis = analyzeMaintenanceScheduleRow(
      odo,
      today,
      nextMiles,
      nextMax,
      nextDate,
      schSt,
      { dueSoonKm, dueSoonDays },
    );

    const mandatory = tpl?.is_mandatory === true;
    let cardStatus: LogServicePackageCard["status"] = "ok";
    if (mandatory) cardStatus = "mandatory";
    else if (analysis.status === "overdue") cardStatus = "overdue";
    else if (analysis.status === "pending") cardStatus = "due_soon";

    const kmLabel = kmLabelForSchedule(
      analysis.status === "overdue" ? "overdue" : analysis.status === "pending" ? "due_soon" : "ok",
      odo,
      nextMiles,
      analysis.kmOverdue,
    );

    const sortScore =
      analysis.status === "overdue"
        ? 1_000_000 + (analysis.kmOverdue ?? 0)
        : analysis.status === "pending"
        ? 100_000 - (nextMiles != null && odo > 0 ? Math.max(0, nextMiles - odo) : 0)
        : 0;

    packages.push({
      templateId: tid,
      label,
      intervalText,
      status: cardStatus,
      kmLabel,
      sortScore,
    });
  }

  packages.sort((a, b) => b.sortScore - a.sortScore);

  const { data: compRows } = await supabase
    .from("vehicle_component_schedule")
    .select(
      "category_id, next_due_km, next_due_km_max, next_due_date, schedule_status, category:maintenance_service_categories(id, name, icon_key, parent_id)",
    )
    .eq("organization_id", orgId)
    .eq("vehicle_id", vehicleId);

  const systemIds = new Set<string>();
  for (const row of compRows || []) {
    const cat = row.category as { parent_id?: string | null } | null;
    if (cat?.parent_id) systemIds.add(String(cat.parent_id));
  }
  const { data: systems } = systemIds.size
    ? await supabase
      .from("maintenance_service_categories")
      .select("id, name")
      .in("id", [...systemIds])
    : { data: [] as { id: string; name: string }[] };
  const systemNameById = new Map<string, string>();
  for (const s of systems || []) systemNameById.set(String(s.id), String(s.name));

  const suggestedOperations: LogServiceSuggestedOp[] = [];
  for (const row of compRows || []) {
    const cat = row.category as {
      id?: string;
      name?: string;
      icon_key?: string;
      parent_id?: string | null;
    } | null;
    if (!cat?.id) continue;
    const nextMiles = row.next_due_km != null ? Number(row.next_due_km) : null;
    const nextMax = row.next_due_km_max != null ? Number(row.next_due_km_max) : null;
    const nextDate = row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null;
    const schSt = row.schedule_status != null ? String(row.schedule_status) : "active";
    const analysis = analyzeMaintenanceScheduleRow(
      odo,
      today,
      nextMiles,
      nextMax,
      nextDate,
      schSt,
      { dueSoonKm, dueSoonDays },
    );
    if (analysis.status !== "overdue" && analysis.status !== "pending") continue;
    suggestedOperations.push({
      categoryId: String(cat.id),
      categoryName: String(cat.name ?? "Service"),
      systemName: cat.parent_id ? systemNameById.get(String(cat.parent_id)) ?? null : null,
      iconKey: cat.icon_key != null ? String(cat.icon_key) : null,
      status: analysis.status === "overdue" ? "overdue" : "due_soon",
    });
  }

  suggestedOperations.sort((a, b) => {
    if (a.status !== b.status) return a.status === "overdue" ? -1 : 1;
    return a.categoryName.localeCompare(b.categoryName);
  });

  const { data: inspTpl } = await supabase
    .from("maintenance_inspection_templates")
    .select("id")
    .limit(1)
    .maybeSingle();
  let inspectionPointCount = 24;
  if (inspTpl?.id) {
    const { count } = await supabase
      .from("maintenance_inspection_items")
      .select("id", { count: "exact", head: true })
      .eq("template_id", String(inspTpl.id));
    if (count != null && count > 0) inspectionPointCount = count;
  }

  return {
    vehicleId,
    odometer: odo,
    packages: packages.slice(0, 12),
    suggestedOperations: suggestedOperations.slice(0, 8),
    inspectionPointCount,
  };
}
