import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardCheck, Loader2, Package, Plus, Search } from "lucide-react";
import { MaintenanceIcon } from "../../MaintenanceIcon";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";

export type LogServicePackageChoice = {
  id: string;
  shortLabel: string;
  iconKey: string;
  dueKind?: string;
  intervalText?: string | null;
  status?: "overdue" | "due_soon" | "ok" | "mandatory";
  kmLabel?: string | null;
};

export type LogServiceSuggestedOp = {
  categoryId: string;
  categoryName: string;
  systemName: string | null;
  iconKey: string | null;
  status: "overdue" | "due_soon";
};

export type LogServiceWhatWasDoneStepProps = {
  packages: LogServicePackageChoice[];
  quickJobs: MaintenanceServiceCategory[];
  quickJobsLoading: boolean;
  suggestedOperations?: LogServiceSuggestedOp[];
  inspectionPointCount?: number;
  onPickPackage: (pkg: LogServicePackageChoice) => void;
  onPickSystem: (sys: MaintenanceServiceCategory) => void;
  onPickSuggested?: (op: LogServiceSuggestedOp) => void;
  onOpenInspection: () => void;
  vinLabel?: string | null;
};

function packageCardClass(status?: LogServicePackageChoice["status"]): string {
  if (status === "overdue") {
    return "bg-error-container/40 border-error/30 hover:bg-error-container/60 relative overflow-hidden";
  }
  if (status === "mandatory") {
    return "border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low";
  }
  return "border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low hover:border-primary/30";
}

export function LogServiceWhatWasDoneStep({
  packages,
  quickJobs,
  quickJobsLoading,
  suggestedOperations = [],
  inspectionPointCount = 24,
  onPickPackage,
  onPickSystem,
  onPickSuggested,
  onOpenInspection,
  vinLabel,
}: LogServiceWhatWasDoneStepProps) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearch("");
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suggestedOperations.slice(0, 5);
    const pkgHits = packages
      .filter((p) => p.shortLabel.toLowerCase().includes(q))
      .map(
        (p): LogServiceSuggestedOp => ({
          categoryId: p.id,
          categoryName: p.shortLabel,
          systemName: "Package",
          iconKey: p.iconKey,
          status: p.status === "overdue" ? "overdue" : "due_soon",
        }),
      );
    const sysHits = quickJobs
      .filter((s) => s.name.toLowerCase().includes(q))
      .map(
        (s): LogServiceSuggestedOp => ({
          categoryId: s.id,
          categoryName: s.name,
          systemName: "System",
          iconKey: s.icon_key,
          status: "due_soon",
        }),
      );
    const opHits = suggestedOperations.filter(
      (o) =>
        o.categoryName.toLowerCase().includes(q) ||
        (o.systemName && o.systemName.toLowerCase().includes(q)),
    );
    return [...opHits, ...pkgHits, ...sysHits].slice(0, 8);
  }, [search, suggestedOperations, packages, quickJobs]);

  const sortedPackages = useMemo(() => {
    const score = (p: LogServicePackageChoice) => {
      if (p.status === "overdue") return 3;
      if (p.status === "mandatory") return 2;
      if (p.status === "due_soon") return 1;
      return 0;
    };
    return [...packages].sort((a, b) => score(b) - score(a));
  }, [packages]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-end gap-4">
          <div>
            <span className="text-[11px] text-secondary uppercase tracking-wider font-semibold">
              {LOG_SERVICE_COPY.wizardEyebrow}
            </span>
            <h2 className="text-2xl font-semibold text-on-surface mt-0.5">
              {LOG_SERVICE_COPY.whatWasDoneHeading}
            </h2>
          </div>
          {vinLabel ? (
            <span className="text-xs text-on-surface-variant bg-surface-container px-2 py-0.5 rounded shrink-0 font-mono">
              VIN: {vinLabel}
            </span>
          ) : null}
        </div>

        <div className="relative w-full">
          <div className="bg-surface-container-low rounded-lg p-1 flex items-center shadow-sm">
            <div className="px-2 text-secondary flex items-center">
              <Search className="w-5 h-5" />
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search a job — e.g. oil change, brake pads, wipers"
              className="w-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none py-1"
            />
            <span className="bg-surface-container text-on-surface-variant font-mono text-[10px] px-1.5 py-0.5 rounded mr-1">
              ESC
            </span>
          </div>
          {searchOpen && searchHits.length > 0 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 bg-surface-container-lowest rounded-lg shadow-xl overflow-hidden p-1 flex flex-col gap-0.5">
              <div className="px-3 py-1 text-[10px] text-secondary uppercase font-semibold">
                {LOG_SERVICE_COPY.suggestedOperations}
              </div>
              {searchHits.map((op) => (
                <button
                  key={`${op.categoryId}-${op.categoryName}`}
                  type="button"
                  className="w-full text-left px-3 py-2 rounded hover:bg-surface-container flex items-center justify-between group transition-colors"
                  onClick={() => {
                    setSearchOpen(false);
                    if (onPickSuggested) onPickSuggested(op);
                    else {
                      const pkg = packages.find((p) => p.id === op.categoryId);
                      if (pkg) onPickPackage(pkg);
                    }
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MaintenanceIcon iconKey={op.iconKey || "wrench"} className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-medium text-on-surface truncate">{op.categoryName}</span>
                    {op.systemName ? (
                      <>
                        <span className="text-on-surface-variant/40">—</span>
                        <span className="text-xs text-on-surface-variant truncate">{op.systemName}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {op.status === "overdue" ? (
                      <span className="bg-error-container text-on-error-container text-[10px] px-1.5 py-0.5 rounded">
                        Due
                      </span>
                    ) : null}
                    <ArrowRight className="w-4 h-4 text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-[18px] h-[18px] text-primary" />
            <h3 className="text-lg font-semibold text-on-surface">{LOG_SERVICE_COPY.servicePackages}</h3>
          </div>
          <span className="text-xs text-secondary">{LOG_SERVICE_COPY.sortedByPriority}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {sortedPackages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => onPickPackage(pkg)}
              className={`flex flex-col justify-between gap-2 p-4 rounded-xl border transition-colors text-left min-h-[120px] ${packageCardClass(pkg.status)}`}
            >
              {pkg.status === "overdue" ? (
                <div className="absolute top-0 left-0 w-full h-1 bg-error" />
              ) : null}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-1">
                  {pkg.status === "overdue" ? (
                    <span className="bg-error text-on-error text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase">
                      Overdue
                    </span>
                  ) : pkg.status === "mandatory" ? (
                    <span className="bg-surface-container-highest text-on-surface text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase">
                      Mandatory
                    </span>
                  ) : pkg.status === "due_soon" ? (
                    <span className="bg-tertiary-container text-on-tertiary text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase">
                      Due soon
                    </span>
                  ) : (
                    <span className="h-5" />
                  )}
                  <MaintenanceIcon iconKey={pkg.iconKey} className="w-5 h-5 text-on-surface" />
                </div>
                <span className="text-sm font-bold text-on-surface leading-tight">{pkg.shortLabel}</span>
                {pkg.intervalText ? (
                  <span className="text-[10px] text-on-surface-variant">{pkg.intervalText}</span>
                ) : pkg.dueKind ? (
                  <span className="text-[10px] text-secondary uppercase tracking-wide">
                    {pkg.dueKind.replace(/_/g, " ")}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between pt-1">
                {pkg.kmLabel ? (
                  <span
                    className={`font-mono text-[10px] font-semibold ${
                      pkg.status === "overdue" ? "text-error" : "text-secondary"
                    }`}
                  >
                    {pkg.kmLabel}
                  </span>
                ) : (
                  <span />
                )}
                <span className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-on-surface">{LOG_SERVICE_COPY.quickJobs}</h3>
        <p className="text-xs text-secondary">{LOG_SERVICE_COPY.quickJobsHint}</p>
        {quickJobsLoading ? (
          <div className="flex items-center gap-2 text-sm text-secondary py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading systems…
          </div>
        ) : quickJobs.length === 0 ? (
          <p className="text-sm text-secondary py-2">No systems available.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickJobs.map((sys) => (
              <button
                key={sys.id}
                type="button"
                onClick={() => onPickSystem(sys)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-center min-h-[108px]"
              >
                <div className="bg-surface-container p-3 rounded-xl text-on-surface">
                  <MaintenanceIcon iconKey={sys.icon_key} className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium text-on-surface leading-tight">{sys.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={onOpenInspection}
          className="w-full flex items-center justify-between gap-3 p-4 rounded-xl border border-dashed border-outline-variant bg-surface-container-low hover:bg-surface-container transition-colors text-left min-h-11"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-surface-container-lowest p-3 rounded-xl shadow-sm text-on-surface shrink-0">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-on-surface">{LOG_SERVICE_COPY.digitalInspection}</p>
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                  {inspectionPointCount}-point
                </span>
              </div>
              <p className="text-xs text-secondary">{LOG_SERVICE_COPY.digitalInspectionHint}</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-primary shrink-0 flex items-center gap-0.5">
            Launch <ArrowRight className="w-4 h-4" />
          </span>
        </button>
      </section>
    </div>
  );
}
