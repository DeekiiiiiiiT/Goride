import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ClipboardCheck, Loader2, Package, Plus, Search } from "lucide-react";
import { MaintenanceIcon } from "../../MaintenanceIcon";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import { JobTooltip } from "./JobTooltip";
import { actionLabel } from "./systemSections";
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
  /** Absent for plain search hits that are not due. */
  status?: "overdue" | "due_soon" | null;
};

/** One row per job: the server sends one suggestion per wheel position (e.g. Brakes ×4). */
export function dedupeSuggestedOps(ops: LogServiceSuggestedOp[]): LogServiceSuggestedOp[] {
  const byId = new Map<string, LogServiceSuggestedOp>();
  for (const op of ops) {
    const prev = byId.get(op.categoryId);
    if (!prev || (prev.status !== "overdue" && op.status === "overdue")) byId.set(op.categoryId, op);
  }
  return [...byId.values()];
}

/** Rank jobs/groups/packages for the search box. Every word must match name, group or description. */
export function searchLogServiceJobs(args: {
  query: string;
  jobs: MaintenanceServiceCategory[];
  /** All groups — used for the group name shown next to a job. */
  systems: MaintenanceServiceCategory[];
  /** Groups the user can open (the Quick jobs cards). Only these appear as group results. */
  pickableGroups: MaintenanceServiceCategory[];
  packages: LogServicePackageChoice[];
  dueOps: LogServiceSuggestedOp[];
  /** Job id → section in its own group (e.g. "Crankshaft & Rotating Assembly"). */
  sectionNameByJob?: Map<string, string>;
  limit?: number;
}): LogServiceSuggestedOp[] {
  const q = args.query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const systemName = new Map(args.systems.map((s) => [s.id, s.name]));
  const dueById = new Map(args.dueOps.map((o) => [o.categoryId, o.status ?? null]));
  const scored: Array<{ op: LogServiceSuggestedOp; score: number }> = [];

  const score = (name: string, group: string, desc: string): number => {
    const n = name.toLowerCase();
    const hay = `${n} ${group.toLowerCase()} ${desc.toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) return 0;
    if (n.startsWith(q)) return 100;
    if (n.includes(q)) return 80;
    if (words.every((w) => n.includes(w))) return 70;
    if (words.every((w) => `${n} ${group.toLowerCase()}`.includes(w))) return 50;
    return 20; // description-only match, e.g. "pads" → Brakes
  };

  for (const p of args.packages) {
    const s = score(p.shortLabel, "package", "");
    if (s) {
      scored.push({
        op: {
          categoryId: p.id,
          categoryName: p.shortLabel,
          systemName: "Package",
          iconKey: p.iconKey,
          status: p.status === "overdue" ? "overdue" : null,
        },
        score: s + 5,
      });
    }
  }
  for (const sys of args.pickableGroups) {
    const s = score(sys.name, "", sys.description || "");
    if (s) {
      scored.push({
        op: { categoryId: sys.id, categoryName: sys.name, systemName: "Group", iconKey: sys.icon_key, status: null },
        score: s - 1,
      });
    }
  }
  for (const job of args.jobs) {
    const group = job.parent_id ? systemName.get(job.parent_id) ?? "" : "";
    const section = args.sectionNameByJob?.get(job.id) ?? "";
    const s = score(job.name, `${group} ${section}`, job.description || "");
    if (s) {
      // F3: "Group · Section · Action" (section only when the job sits in one of its own group's sections).
      const label = [group, section, actionLabel(job.default_action)].filter(Boolean).join(" · ");
      scored.push({
        op: {
          categoryId: job.id,
          categoryName: job.name,
          systemName: label || null,
          iconKey: job.icon_key,
          status: dueById.get(job.id) ?? null,
        },
        score: s + (dueById.get(job.id) === "overdue" ? 3 : 0),
      });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.op.categoryName.localeCompare(b.op.categoryName));
  const seen = new Set<string>();
  const out: LogServiceSuggestedOp[] = [];
  for (const { op } of scored) {
    if (seen.has(op.categoryId)) continue;
    seen.add(op.categoryId);
    out.push(op);
    if (out.length >= (args.limit ?? 8)) break;
  }
  return out;
}

export type LogServiceWhatWasDoneStepProps = {
  packages: LogServicePackageChoice[];
  quickJobs: MaintenanceServiceCategory[];
  /** Every job (component), so search finds jobs that are not due. */
  allJobs?: MaintenanceServiceCategory[];
  /** Every group (system), for group names in results. */
  allSystems?: MaintenanceServiceCategory[];
  /** Job id → section in its own group, for search labels. */
  sectionNameByJob?: Map<string, string>;
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
  allJobs = [],
  allSystems = [],
  sectionNameByJob,
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
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  // Close the dropdown when the user clicks or taps anywhere outside the search box.
  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [searchOpen]);

  const dueOps = useMemo(() => dedupeSuggestedOps(suggestedOperations), [suggestedOperations]);
  const hasQuery = search.trim().length > 0;

  const searchHits = useMemo(() => {
    if (!hasQuery) return dueOps.slice(0, 5);
    return searchLogServiceJobs({
      query: search,
      jobs: allJobs,
      systems: allSystems.length ? allSystems : quickJobs,
      pickableGroups: quickJobs,
      sectionNameByJob,
      packages,
      dueOps,
    });
  }, [hasQuery, search, dueOps, allJobs, allSystems, quickJobs, packages, sectionNameByJob]);

  const pickHit = (op: LogServiceSuggestedOp) => {
    setSearchOpen(false);
    setSearch("");
    if (onPickSuggested) onPickSuggested(op);
    else {
      const pkg = packages.find((p) => p.id === op.categoryId);
      if (pkg) onPickPackage(pkg);
    }
  };

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
            <span className="text-[11px] text-stitch-secondary uppercase tracking-wider font-semibold">
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

        <div className="relative w-full" ref={searchBoxRef}>
          <div className="bg-surface-container-low rounded-lg p-1 flex items-center shadow-sm">
            <div className="px-2 text-stitch-secondary flex items-center">
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
              onKeyDown={(e) => {
                if (e.key === "Escape" && (searchOpen || search)) {
                  // Close the dropdown only — don't let Esc also close the whole Log service window.
                  e.preventDefault();
                  e.stopPropagation();
                  setSearch("");
                  setSearchOpen(false);
                }
                if (e.key === "Enter" && searchHits.length > 0) {
                  e.preventDefault();
                  pickHit(searchHits[0]);
                }
              }}
              placeholder="Search a job — e.g. oil change, brake pads, wipers"
              className="w-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none py-1"
            />
            <span className="bg-surface-container text-on-surface-variant font-mono text-[10px] px-1.5 py-0.5 rounded mr-1">
              ESC
            </span>
          </div>
          {searchOpen && (searchHits.length > 0 || hasQuery) ? (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 bg-surface-container-lowest rounded-lg shadow-xl overflow-hidden p-1 flex flex-col gap-0.5 ring-1 ring-outline-variant/30">
              <div className="px-3 py-1 text-[10px] text-stitch-secondary uppercase font-semibold">
                {hasQuery ? LOG_SERVICE_COPY.searchResultsHeading : LOG_SERVICE_COPY.suggestedOperations}
              </div>
              {hasQuery && searchHits.length === 0 ? (
                <p className="px-3 py-2 text-sm text-stitch-secondary">
                  {LOG_SERVICE_COPY.searchNoMatch(search.trim())}
                </p>
              ) : null}
              {searchHits.map((op) => (
                <button
                  key={op.categoryId}
                  type="button"
                  className="w-full text-left px-3 py-2 rounded hover:bg-surface-container flex items-center justify-between group transition-colors"
                  onClick={() => pickHit(op)}
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
                    <ArrowRight className="w-4 h-4 text-stitch-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
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
          <span className="text-xs text-stitch-secondary">{LOG_SERVICE_COPY.sortedByPriority}</span>
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
                  <span className="text-[10px] text-stitch-secondary uppercase tracking-wide">
                    {pkg.dueKind.replace(/_/g, " ")}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between pt-1">
                {pkg.kmLabel ? (
                  <span
                    className={`font-mono text-[10px] font-semibold ${
                      pkg.status === "overdue" ? "text-error" : "text-stitch-secondary"
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
        <p className="text-xs text-stitch-secondary">{LOG_SERVICE_COPY.quickJobsHint}</p>
        {quickJobsLoading ? (
          <div className="flex items-center gap-2 text-sm text-stitch-secondary py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading systems…
          </div>
        ) : quickJobs.length === 0 ? (
          <p className="text-sm text-stitch-secondary py-2">No systems available.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickJobs.map((sys) => (
              <JobTooltip key={sys.id} text={sys.description}>
              <button
                type="button"
                onClick={() => onPickSystem(sys)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-center min-h-[108px]"
              >
                <div className="bg-surface-container p-3 rounded-xl text-on-surface">
                  <MaintenanceIcon iconKey={sys.icon_key} className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium text-on-surface leading-tight">{sys.name}</span>
              </button>
              </JobTooltip>
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
              <p className="text-xs text-stitch-secondary">{LOG_SERVICE_COPY.digitalInspectionHint}</p>
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
