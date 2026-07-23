import type {
  CatalogMaintenanceTaskOption,
  MaintenanceServiceCategory,
  VehicleMaintenanceScheduleRowApi,
} from "../types/maintenance";

/** Package membership rows are components (leaf); drop systems if present. */
function asPackageComponents(
  categories: MaintenanceServiceCategory[],
): MaintenanceServiceCategory[] {
  return categories.filter(
    (c) => c.kind !== "system" && !String(c.code || "").startsWith("sys_"),
  );
}

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
    const rawCats: MaintenanceServiceCategory[] = Array.isArray(tpl.categories)
      ? (tpl.categories as MaintenanceServiceCategory[])
      : [];
    const categories = asPackageComponents(rawCats);
    const fromCats = categories
      .map((c) => (c?.name || "").trim())
      .filter(Boolean);
    const desc = tpl.description?.trim();
    const fromDesc = desc
      ? desc.split(/\n+/).map((s) => s.trim()).filter(Boolean)
      : [];
    const checklistLines = fromCats.length
      ? fromCats
      : fromDesc.length
        ? fromDesc
        : [taskName];
    out.push({
      templateId: tid,
      label: taskName,
      checklistLines,
      iconKey: tpl.icon_key || undefined,
      categories: categories.length ? categories : undefined,
      dueKind: tpl.due_kind || undefined,
    });
  }
  return out;
}
