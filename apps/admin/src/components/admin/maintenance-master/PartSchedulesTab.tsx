import { Fragment, useMemo } from "react";
import type { MaintenanceServiceCategory } from "../../../types/maintenance";
import type { MaintenanceSummary, PartScheduleIndexRow } from "./maintenanceMasterApi";
import { formatInterval } from "./maintenanceMasterFormat";
import { groupCategoriesByArea } from "./mmGroupByArea";
import { MmConfidenceLabel, MmSourceChip, MmStatusChip, partIconKey } from "./MmChips";

type Props = {
  summary: MaintenanceSummary | null;
  indexRows: PartScheduleIndexRow[];
  categories: MaintenanceServiceCategory[];
  search: string;
  onSearch: (v: string) => void;
  sourceFilter: string;
  onSourceFilter: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  scopeFilter: string;
  onScopeFilter: (v: string) => void;
  bannerDismissed: boolean;
  onDismissBanner: () => void;
  onOpenPart: (componentId: string) => void;
  onPreviewCar: () => void;
  onAddSchedule: () => void;
  canWrite: boolean;
};

const SOURCE_CHIPS = [
  { id: "all", label: "All sources" },
  { id: "maker_manual", label: "Car maker" },
  { id: "part_maker", label: "Part maker" },
  { id: "roam_policy", label: "Roam policy" },
];

const STATUS_CHIPS = [
  { id: "all", label: "All status" },
  { id: "active", label: "Active" },
  { id: "needs_checking", label: "Needs checking" },
  { id: "draft", label: "Draft" },
  { id: "retired", label: "Retired" },
];

export function PartSchedulesTab({
  summary,
  indexRows,
  categories,
  search,
  onSearch,
  sourceFilter,
  onSourceFilter,
  statusFilter,
  onStatusFilter,
  scopeFilter,
  onScopeFilter,
  bannerDismissed,
  onDismissBanner,
  onOpenPart,
  onPreviewCar,
  onAddSchedule,
  canWrite,
}: Props) {
  const indexByComponent = useMemo(() => {
    const m = new Map<string, PartScheduleIndexRow>();
    for (const r of indexRows) m.set(r.component_id, r);
    return m;
  }, [indexRows]);

  const areas = useMemo(() => groupCategoriesByArea(categories), [categories]);

  const filteredAreas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return areas
      .map((area) => ({
        ...area,
        components: area.components.filter((c) => {
          const idx = indexByComponent.get(c.id);
          if (sourceFilter !== "all" && idx?.source_type !== sourceFilter) return false;
          if (statusFilter !== "all" && idx?.status !== statusFilter) return false;
          if (scopeFilter === "specific" && (idx?.specific_count ?? 0) === 0) return false;
          if (scopeFilter === "everyone" && idx && idx.specific_count > 0) return false;
          if (!q) return true;
          return (
            c.name.toLowerCase().includes(q) ||
            c.code.toLowerCase().includes(q) ||
            String(c.op_code ?? "").toLowerCase().includes(q)
          );
        }),
      }))
      .filter((a) => a.components.length > 0);
  }, [areas, indexByComponent, search, sourceFilter, statusFilter, scopeFilter]);

  const src = summary?.sourceCounts ?? { maker_manual: 0, part_maker: 0, roam_policy: 0 };
  const srcTotal = Math.max(1, src.maker_manual + src.part_maker + src.roam_policy);

  return (
    <div className="mt-6 space-y-6">
      {!bannerDismissed ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-secondary-container/60 bg-secondary-container/30 px-4 py-3 text-sm text-on-secondary-container">
          <p>
            Part schedules decide how often. Service packages only group parts for one garage visit.{" "}
            <button type="button" className="font-medium text-secondary underline">
              How this works
            </button>
          </p>
          <button type="button" className="text-on-surface-variant" onClick={onDismissBanner} aria-label="Dismiss">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          title="Part schedules"
          value={String(summary?.partScheduleCount ?? indexRows.length)}
          detail={`${summary?.globalActive ?? 0} for everyone · ${summary?.specificCount ?? 0} specific`}
        />
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Where numbers come from</p>
          <div className="mt-3 space-y-2 text-[11px] text-on-surface-variant">
            {(
              [
                ["Car maker", src.maker_manual],
                ["Part maker", src.part_maker],
                ["Roam policy", src.roam_policy],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-20 shrink-0">{label}</span>
                <div className="h-1.5 flex-1 rounded-full bg-surface-container">
                  <div
                    className="h-full rounded-full bg-secondary"
                    style={{ width: `${Math.round((n / srcTotal) * 100)}%` }}
                  />
                </div>
                <span className="font-code w-6 text-right text-on-surface">{n}</span>
              </div>
            ))}
          </div>
        </div>
        <SummaryCard
          title="Needs your attention"
          value={String(summary?.reviewCount ?? 0)}
          detail={`${summary?.openConflicts ?? 0} open conflicts`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 max-md:hidden">
        <input
          type="search"
          placeholder="Search a part…"
          className="w-full max-w-xs rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-4 py-2 text-sm text-on-surface hover:bg-surface-container"
          onClick={onPreviewCar}
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
          Preview a car
        </button>
        {canWrite ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-on-secondary"
            onClick={onAddSchedule}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add schedule
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 max-md:hidden">
        {SOURCE_CHIPS.map((c) => (
          <FilterChip key={c.id} active={sourceFilter === c.id} onClick={() => onSourceFilter(c.id)} label={c.label} />
        ))}
        {STATUS_CHIPS.map((c) => (
          <FilterChip key={c.id} active={statusFilter === c.id} onClick={() => onStatusFilter(c.id)} label={c.label} />
        ))}
        <select
          className="rounded-full border border-outline-variant/40 bg-surface-container-lowest px-3 py-1 text-xs text-on-surface"
          value={scopeFilter}
          onChange={(e) => onScopeFilter(e.target.value)}
        >
          <option value="all">Who it covers · All</option>
          <option value="everyone">Everyone only</option>
          <option value="specific">Has more specific</option>
        </select>
      </div>

      <div className="space-y-2 md:hidden" data-mm-mobile-parts>
        {filteredAreas.map((area) => (
          <Fragment key={`m-${area.areaId}`}>
            <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{area.areaName}</p>
            {area.components.map((c) => {
              const idx = indexByComponent.get(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  data-mm-mobile-part={c.id}
                  className="flex w-full items-center justify-between gap-2 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-left"
                  onClick={() => onOpenPart(c.id)}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="material-symbols-outlined shrink-0 text-on-surface-variant">
                      {partIconKey(c.icon_key)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-on-surface">{c.name}</p>
                      <p className="font-code text-xs text-on-surface-variant">
                        {idx ? formatInterval(idx.interval_km, idx.interval_months) : "—"}
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined shrink-0 text-on-surface-variant">chevron_right</span>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest max-md:hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-outline-variant/30 text-xs uppercase text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Part</th>
              <th className="px-4 py-3">Everyone schedule</th>
              <th className="px-4 py-3">More specific</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">In packages</th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {filteredAreas.map((area) => (
              <Fragment key={area.areaId}>
                <tr className="bg-surface-container-low/80">
                  <td colSpan={7} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    {area.areaName}
                  </td>
                </tr>
                {area.components.map((c) => {
                  const idx = indexByComponent.get(c.id);
                  return (
                    <tr
                      key={c.id}
                      className="group border-b border-outline-variant/20 hover:bg-primary-container/20 cursor-pointer"
                      onClick={() => onOpenPart(c.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-on-surface-variant">{partIconKey(c.icon_key)}</span>
                          <div>
                            <p className="font-medium text-on-surface">{c.name}</p>
                            {c.op_code ? (
                              <p className="text-xs text-on-surface-variant">{c.op_code}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-code text-xs text-on-surface">
                        {idx ? formatInterval(idx.interval_km, idx.interval_months) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {(idx?.specific_count ?? 0) === 0 ? (
                          <span className="opacity-70 group-hover:opacity-100">0</span>
                        ) : (
                          <span>{idx?.specific_count} schedules</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {idx?.source_type ? (
                          <div className="flex flex-col gap-0.5">
                            <MmSourceChip source={idx.source_type} />
                            <MmConfidenceLabel confidence={idx.confidence} />
                          </div>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <MmStatusChip status={idx?.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(idx?.package_names ?? []).slice(0, 3).map((p) => (
                            <span
                              key={p}
                              className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant"
                            >
                              {p.split(" ")[0]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:grid-cols-3 max-md:hidden">
        {[
          {
            title: "Part schedule vs package",
            body: "Changing a package does not change when a part is due. Edit the part schedule for that.",
          },
          {
            title: "More specific wins",
            body: "A platform or engine schedule overrides the everyone rule for matching cars.",
          },
          {
            title: "Review list",
            body: "Two active schedules for the same cars are labelled needs checking until you pick one.",
          },
        ].map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 text-sm"
          >
            <p className="font-medium text-on-surface">{card.title}</p>
            <p className="mt-1 text-on-surface-variant">{card.body}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-on-surface-variant max-md:hidden">
        Distances are kilometres. Due is whichever comes first: distance or time.
      </p>
    </div>
  );
}

function SummaryCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{title}</p>
      <p className="mt-1 font-headline text-2xl text-on-surface">{value}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{detail}</p>
    </div>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active ? "bg-secondary-container text-on-secondary-container" : "border border-outline-variant/40 text-on-surface-variant"
      }`}
    >
      {label}
    </button>
  );
}
