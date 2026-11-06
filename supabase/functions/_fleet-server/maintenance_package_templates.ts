/**
 * M-14: part rules (component_id set) are not service packages.
 */
export function isMaintenancePackageTemplate(row: { component_id?: unknown | null }): boolean {
  const cid = row.component_id;
  return cid == null || cid === "";
}

/** Package-only rows for list/bootstrap/catalog reads. */
export function filterMaintenancePackageTemplates<T extends { component_id?: unknown | null }>(
  rows: T[] | null | undefined,
): T[] {
  return (rows ?? []).filter(isMaintenancePackageTemplate);
}

/** Count package templates the same way bootstrap lists global + variant packages. */
export function countBootstrapPackageTemplates(
  rows: Array<{ template_scope?: string; component_id?: unknown | null }>,
): { globalApplied: number; catalogApplied: number; total: number } {
  const packages = filterMaintenancePackageTemplates(rows);
  const globalApplied = packages.filter((t) => String(t.template_scope ?? "") === "global").length;
  const catalogApplied = packages.filter((t) => String(t.template_scope ?? "") === "variant").length;
  return { globalApplied, catalogApplied, total: packages.length };
}
