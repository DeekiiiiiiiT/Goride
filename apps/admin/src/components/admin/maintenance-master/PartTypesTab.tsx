import { useMemo, useState } from "react";
import type { MaintenanceServiceCategory } from "../../../types/maintenance";
import type { MaintenanceRule } from "./maintenanceMasterApi";
import { groupCategoriesByArea } from "./mmGroupByArea";
import { MmStatusChip, partIconKey } from "./MmChips";

type Props = {
  categories: MaintenanceServiceCategory[];
  rules: MaintenanceRule[];
  usageFleetByCategory: Map<string, number>;
  canWrite: boolean;
  onRetire: (cat: MaintenanceServiceCategory) => void;
  onAddPartType: () => void;
};

export function PartTypesTab({
  categories,
  rules,
  usageFleetByCategory,
  canWrite,
  onRetire,
  onAddPartType,
}: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const components = useMemo(
    () => categories.filter((c) => c.kind === "component"),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return components;
    return components.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        String(c.op_code ?? "").toLowerCase().includes(q),
    );
  }, [components, search]);

  const areas = useMemo(() => groupCategoriesByArea(categories), [categories]);
  const areaName = (c: MaintenanceServiceCategory) => {
    const g = areas.find((a) => a.components.some((x) => x.id === c.id));
    return g?.areaName ?? "Other";
  };

  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const hasSchedule = (id: string) =>
    rules.some((r) => r.component_id === id && r.status !== "retired");

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-on-surface-variant">
          {filtered.length} part types · {filtered.filter((c) => hasSchedule(c.id)).length} with a schedule
        </p>
        {canWrite ? (
          <button
            type="button"
            className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-on-secondary"
            onClick={onAddPartType}
          >
            + Add part type
          </button>
        ) : null}
      </div>
      <input
        type="search"
        placeholder="Search part types…"
        className="w-full max-w-md rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
      />
      <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-outline-variant/30 text-xs uppercase text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Part</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">On Roam Fleet cars</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => {
              const status = (c as { status?: string }).status ?? "active";
              return (
                <tr key={c.id} className="border-b border-outline-variant/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant">
                        {partIconKey(c.icon_key)}
                      </span>
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-on-surface-variant">{c.op_code ?? c.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{areaName(c)}</td>
                  <td className="px-4 py-3 font-code text-xs">{usageFleetByCategory.get(c.id) ?? 0}</td>
                  <td className="px-4 py-3 text-xs">{hasSchedule(c.id) ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    <MmStatusChip status={status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && status !== "retired" ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-secondary"
                        onClick={() => onRetire(c)}
                      >
                        Retire
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > pageSize ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0}
            className="text-sm text-secondary disabled:opacity-40"
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={(page + 1) * pageSize >= filtered.length}
            className="text-sm text-secondary disabled:opacity-40"
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
