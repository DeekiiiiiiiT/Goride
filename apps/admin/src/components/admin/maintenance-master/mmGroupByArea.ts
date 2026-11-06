import type { MaintenanceServiceCategory } from "../../../types/maintenance";

export type AreaGroup = {
  areaId: string;
  areaName: string;
  components: MaintenanceServiceCategory[];
};

/** Group component categories under their system (area) parent. */
export function groupCategoriesByArea(categories: MaintenanceServiceCategory[]): AreaGroup[] {
  const systems = categories.filter((c) => c.kind === "system");
  const components = categories.filter((c) => c.kind === "component");
  const systemById = new Map(systems.map((s) => [s.id, s]));
  const byParent = new Map<string, MaintenanceServiceCategory[]>();
  const orphans: MaintenanceServiceCategory[] = [];

  for (const c of components) {
    const pid = c.parent_id;
    if (!pid || !systemById.has(pid)) {
      orphans.push(c);
      continue;
    }
    const list = byParent.get(pid) || [];
    list.push(c);
    byParent.set(pid, list);
  }

  const groups: AreaGroup[] = [];
  for (const sys of systems.sort((a, b) => a.sort_order - b.sort_order)) {
    const comps = (byParent.get(sys.id) || []).sort((a, b) => a.sort_order - b.sort_order);
    if (comps.length) groups.push({ areaId: sys.id, areaName: sys.name, components: comps });
  }
  if (orphans.length) {
    groups.push({
      areaId: "_other",
      areaName: "Other",
      components: orphans.sort((a, b) => a.sort_order - b.sort_order),
    });
  }
  return groups;
}
