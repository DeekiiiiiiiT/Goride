/** Service packages — look: S43e. A package lists jobs for one garage visit; each job keeps its own schedule. */
import { useEffect, useState } from "react";
import { fetchPackageCategories, type MaintenanceRule } from "./maintenanceMasterApi";
import { formatInterval, isCheckOnly } from "./maintenanceMasterFormat";
import type { MaintenanceServiceCategory } from "../../../types/maintenance";
import { JobIcon, OutlineButton, StatusChip, ActionChip } from "./jobs/jobsUi";
import type { JobAction } from "./jobs/jobsApi";

type PackageRow = Record<string, unknown> & {
  id: string;
  task_name: string;
  interval_km?: number | null;
  interval_months?: number | null;
  status?: string;
  description?: string | null;
};

type Props = {
  token: string;
  packages: PackageRow[];
  partRulesByComponent: Map<string, MaintenanceRule>;
  canWrite: boolean;
  onEditPackage: (pkg: PackageRow) => void;
};

const SHOW_FIRST = 8;

function shortInterval(km?: number | null, mo?: number | null): string {
  const parts: string[] = [];
  if (km != null) parts.push(`${Number(km).toLocaleString()} km`);
  if (mo != null) parts.push(`${mo} mo`);
  return parts.length ? parts.join(" or ") : "—";
}

export function PackagesTab({ token, packages, partRulesByComponent, canWrite, onEditPackage }: Props) {
  const [members, setMembers] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    void Promise.all(
      packages.map(async (pkg) => [pkg.id, await fetchPackageCategories(token, pkg.id)] as const),
    ).then((pairs) => setMembers(Object.fromEntries(pairs)));
  }, [token, packages]);

  return (
    <div className="mt-6 space-y-4">
      <p className="flex items-center gap-2 rounded-xl border border-[#0153dc]/20 bg-[#dbe1ff]/40 px-4 py-3 text-sm text-on-surface">
        <span className="material-symbols-outlined text-[18px] text-[#0153dc]">info</span>
        A package is one garage visit. It lists jobs; each job keeps its own schedule.
      </p>

      {packages.map((pkg) => {
        const rows = (members[pkg.id] ?? []).filter((r) => (r as { category?: unknown }).category);
        const isOpen = expanded.has(pkg.id);
        const shown = isOpen ? rows : rows.slice(0, SHOW_FIRST);
        const more = rows.length - shown.length;
        let anyCheckOnly = false;

        const tiles = shown.map((row) => {
          const cat = (row as { category: MaintenanceServiceCategory }).category;
          const rule = partRulesByComponent.get(cat.id);
          const km = rule?.interval_km ?? cat.default_interval_km;
          const mo = rule?.interval_months ?? cat.default_interval_months;
          const checkOnly = isCheckOnly(km, mo, pkg.interval_km, pkg.interval_months);
          if (checkOnly) anyCheckOnly = true;
          const required = (row as { required?: boolean }).required !== false;
          const action = (cat as { default_action?: JobAction }).default_action;
          return (
            <li key={cat.id} className="flex flex-col justify-between gap-2 rounded-xl border border-outline-variant/30 bg-[#f4f3fa] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <JobIcon iconKey={cat.icon_key} className="h-7 w-7" />
                  <span className="truncate text-sm font-medium text-on-surface" title={cat.name}>
                    {cat.name}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  {required ? <span className="rounded bg-[#0153dc] px-1.5 py-0.5 text-[10px] font-semibold text-white">Required</span> : null}
                  {checkOnly ? (
                    <span className="rounded border border-outline-variant/60 bg-white px-1.5 py-0.5 text-[10px] text-on-surface-variant">Check only</span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-code text-[11px] text-on-surface-variant">{shortInterval(km, mo)}</span>
                {action ? <ActionChip action={action} /> : null}
              </div>
            </li>
          );
        });

        return (
          <article key={pkg.id} className="mm-light-card rounded-2xl border border-outline-variant/30 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-on-surface">{String(pkg.task_name ?? "Package")}</h3>
                <StatusChip status={String(pkg.status ?? "active") === "retired" ? "retired" : "active"} />
                <span className="inline-flex items-center gap-1 rounded bg-[#eeedf6] px-2 py-0.5 font-code text-[11px] text-[#5d5f68]">
                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                  Every {formatInterval(pkg.interval_km, pkg.interval_months)}
                </span>
                <span className="rounded bg-[#eeedf6] px-2 py-0.5 font-code text-[11px] text-[#5d5f68]">
                  {rows.length} job{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              {canWrite ? (
                <OutlineButton icon="edit" onClick={() => onEditPackage(pkg)}>
                  Edit jobs
                </OutlineButton>
              ) : null}
            </div>

            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tiles}
              {more > 0 ? (
                <li>
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => new Set(prev).add(pkg.id))}
                    className="flex h-full w-full items-center gap-2 rounded-xl border border-dashed border-outline-variant/60 bg-white p-3 text-left text-sm font-medium text-[#0153dc] hover:bg-[#f4f3fa]"
                  >
                    <span className="material-symbols-outlined">add_circle</span>+ {more} more job{more === 1 ? "" : "s"} in package
                  </button>
                </li>
              ) : null}
            </ul>

            {anyCheckOnly ? (
              <p className="mt-3 flex items-center gap-1 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px]">help</span>
                Check only = looked at during this visit, replaced only when its own schedule says so.
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
