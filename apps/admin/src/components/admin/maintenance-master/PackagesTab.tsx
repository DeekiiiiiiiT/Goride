import { useEffect, useState } from "react";
import { fetchPackageCategories, type MaintenanceRule } from "./maintenanceMasterApi";
import { formatInterval, isCheckOnly } from "./maintenanceMasterFormat";
import { MmStatusChip } from "./MmChips";
import type { MaintenanceServiceCategory } from "../../../types/maintenance";

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

export function PackagesTab({ token, packages, partRulesByComponent, canWrite, onEditPackage }: Props) {
  const [members, setMembers] = useState<Record<string, Array<Record<string, unknown>>>>({});

  useEffect(() => {
    if (!token) return;
    void Promise.all(
      packages.map(async (pkg) => {
        const rows = await fetchPackageCategories(token, pkg.id);
        return [pkg.id, rows] as const;
      }),
    ).then((pairs) => {
      const next: Record<string, Array<Record<string, unknown>>> = {};
      for (const [id, rows] of pairs) next[id] = rows;
      setMembers(next);
    });
  }, [token, packages]);

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-on-surface-variant">
        A package is one garage visit. It lists parts; each part keeps its own schedule.
      </p>
      {packages.map((pkg) => {
        const rhythm = formatInterval(pkg.interval_km, pkg.interval_months);
        const parts = members[pkg.id] ?? [];
        return (
          <article
            key={pkg.id}
            className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-headline text-headline-sm text-on-surface">{String(pkg.task_name ?? "Package")}</h3>
                  <MmStatusChip status={String(pkg.status ?? "active")} />
                </div>
                {pkg.description ? (
                  <p className="mt-1 text-sm text-on-surface-variant">{String(pkg.description)}</p>
                ) : null}
                <p className="font-code mt-2 text-xs text-on-surface-variant">Visit rhythm: {rhythm}</p>
              </div>
              <div className="flex gap-1">
                {canWrite ? (
                  <button
                    type="button"
                    className="rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs font-medium text-secondary"
                    onClick={() => onEditPackage(pkg)}
                  >
                    Edit parts
                  </button>
                ) : null}
              </div>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {parts.map((row) => {
                const cat = (row as { category?: MaintenanceServiceCategory }).category;
                if (!cat) return null;
                const rule = partRulesByComponent.get(cat.id);
                const partKm = rule?.interval_km ?? cat.default_interval_km;
                const partMo = rule?.interval_months ?? cat.default_interval_months;
                const checkOnly = isCheckOnly(partKm, partMo, pkg.interval_km, pkg.interval_months);
                const required = (row as { required?: boolean }).required !== false;
                return (
                  <li
                    key={cat.id}
                    className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-on-surface">{cat.name}</p>
                    <p className="font-code text-xs text-on-surface-variant">{formatInterval(partKm, partMo)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {required ? (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-on-secondary">
                          Required
                        </span>
                      ) : null}
                      {checkOnly ? (
                        <span className="rounded border border-outline-variant/50 px-1.5 py-0.5 text-[10px] text-on-surface-variant">
                          Check only
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
              Packages don&apos;t change how often a part is due. To change that, edit the part&apos;s schedule.
            </p>
          </article>
        );
      })}
    </div>
  );
}
