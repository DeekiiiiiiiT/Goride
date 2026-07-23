/**
 * Shared maintenance schedule bootstrap (global + catalog templates).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { computeInitialScheduleRow } from "./maintenance_schedule_engine.ts";
import { bootstrapVehicleComponentSchedules } from "./maintenance_service_ledger_core.ts";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeMaintenanceTaskName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function maintenanceTemplateMergeKey(t: { task_code?: unknown; task_name?: unknown }): string {
  const code = t.task_code != null ? String(t.task_code).trim() : "";
  if (code.length > 0) return `code:${code}`;
  return `name:${normalizeMaintenanceTaskName(String(t.task_name ?? ""))}`;
}

type MaintenanceTemplateRow = Record<string, unknown> & {
  id: string;
  template_scope?: string;
};

function mergeGlobalAndCatalogTemplates(
  globalRows: MaintenanceTemplateRow[],
  catalogRows: MaintenanceTemplateRow[],
): { merged: MaintenanceTemplateRow[]; catalogOverridesGlobal: number } {
  const acc = new Map<string, MaintenanceTemplateRow>();
  let catalogOverridesGlobal = 0;
  for (const g of globalRows) {
    acc.set(maintenanceTemplateMergeKey(g), g);
  }
  for (const c of catalogRows) {
    const k = maintenanceTemplateMergeKey(c);
    const prev = acc.get(k);
    if (prev && String(prev.template_scope ?? "global") === "global") {
      catalogOverridesGlobal++;
    }
    acc.set(k, c);
  }
  const list = [...acc.values()];
  list.sort((a, b) => {
    const so = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    if (so !== 0) return so;
    return String(a.task_name ?? "").localeCompare(String(b.task_name ?? ""));
  });
  return { merged: list, catalogOverridesGlobal };
}

export type BootstrapRunResult =
  | { ok: true; emptyTemplates: true; catalogId: string }
  | {
    ok: true;
    emptyTemplates: false;
    created: number;
    globalApplied: number;
    catalogApplied: number;
    skippedDuplicates: number;
    warnings?: string[];
  }
  | { ok: false; error: string; catalogId: string };

export async function executeMaintenanceBootstrap(args: {
  supabase: SupabaseClient;
  organizationId: string;
  vehicleId: string;
  currentOdo: number;
  catalogId: string;
}): Promise<BootstrapRunResult> {
  const sb = args.supabase;
  const { data: globalTemplates, error: gErr } = await sb
    .from("maintenance_task_templates")
    .select("*")
    .eq("template_scope", "global");
  if (gErr) throw gErr;
  const { data: catalogTemplates, error: cErr } = await sb
    .from("maintenance_task_templates")
    .select("*")
    .eq("vehicle_catalog_id", args.catalogId)
    .eq("template_scope", "catalog");
  if (cErr) throw cErr;
  const { merged: templates, catalogOverridesGlobal } = mergeGlobalAndCatalogTemplates(
    (globalTemplates || []) as MaintenanceTemplateRow[],
    (catalogTemplates || []) as MaintenanceTemplateRow[],
  );
  const globalApplied = templates.filter((t) => String(t.template_scope ?? "") === "global").length;
  const catalogApplied = templates.filter((t) => String(t.template_scope ?? "") === "catalog").length;
  if (!templates.length) {
    return {
      ok: true,
      emptyTemplates: true,
      catalogId: args.catalogId,
    };
  }

  const today = todayIso();
  let created = 0;
  const bootstrapErrors: string[] = [];
  for (const t of templates) {
    const computed = computeInitialScheduleRow(t as Record<string, unknown>, args.currentOdo, today);
    if (!computed.ok) {
      bootstrapErrors.push(`${(t as { task_name?: string }).task_name ?? t.id}: ${computed.reason}`);
      continue;
    }
    const row = {
      organization_id: args.organizationId,
      vehicle_id: args.vehicleId,
      template_id: t.id,
      last_performed_miles: args.currentOdo,
      last_performed_date: today,
      next_due_miles: computed.next_due_miles,
      next_due_miles_max: computed.next_due_miles_max,
      next_due_date: computed.next_due_date,
      schedule_status: computed.schedule_status,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("vehicle_maintenance_schedule").upsert(row, {
      onConflict: "organization_id,vehicle_id,template_id",
    });
    if (!error) created++;
  }

  // Component / position schedules from Admin package membership
  try {
    await bootstrapVehicleComponentSchedules({
      sb,
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      currentOdo: args.currentOdo,
      baselineDate: today,
      templateIds: templates.map((t) => t.id),
    });
  } catch (e) {
    console.warn(
      "[maintenance-bootstrap] component schedule bootstrap failed:",
      e instanceof Error ? e.message : String(e),
    );
  }

  if (bootstrapErrors.length && created === 0) {
    return { ok: false, error: bootstrapErrors.join("; "), catalogId: args.catalogId };
  }
  return {
    ok: true,
    emptyTemplates: false,
    created,
    globalApplied,
    catalogApplied,
    skippedDuplicates: catalogOverridesGlobal,
    warnings: bootstrapErrors.length ? bootstrapErrors : undefined,
  };
}
