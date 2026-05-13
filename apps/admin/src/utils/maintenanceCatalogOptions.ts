import type {
  CatalogMaintenanceTaskOption,
  VehicleMaintenanceScheduleRowApi,
} from "../types/maintenance";

/**
 * Derive catalog checklist options from GET maintenance-schedule rows (dedupe by template_id).
 * Same logic as VehicleDetail `catalogMaintenanceOptions` useMemo.
 */
export function catalogOptionsFromScheduleRows(
  rows: VehicleMaintenanceScheduleRowApi[],
): CatalogMaintenanceTaskOption[] {
  const seen = new Set<string>();
  const out: CatalogMaintenanceTaskOption[] = [];
  for (const row of rows) {
    if (!row.template_id || !row.template) continue;
    const tid = String(row.template_id);
    if (seen.has(tid)) continue;
    seen.add(tid);
    const tpl = row.template;
    const taskName = tpl.task_name || "Service";
    const desc = tpl.description?.trim();
    const lines = desc
      ? desc.split(/\n+/).map((s) => s.trim()).filter(Boolean)
      : [];
    out.push({
      templateId: tid,
      label: taskName,
      checklistLines: lines.length ? lines : [taskName],
    });
  }
  return out;
}