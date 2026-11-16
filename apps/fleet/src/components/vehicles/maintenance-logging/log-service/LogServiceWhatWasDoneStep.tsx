import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronRight, ClipboardCheck, Loader2, Package, Plus, Search } from "lucide-react";
import { MaintenanceIcon } from "../../MaintenanceIcon";
import { LS, LT } from "./logServiceStitch";
import { GroupTabs } from "./LogServiceSystemPicker";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import { JobTooltip } from "./JobTooltip";
import { actionLabel } from "./systemSections";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";
import { groupFitCounts, isNotUsual, powertrainPill, type JobFitState } from "./jobFit";
import {
  CouldNotCheckBanner,
  FitBanner,
  GroupsRemovedCaption,
  ShowAllButton,
  UnknownEngineBanner,
} from "./JobFitUi";

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
  /** Powertrain job fit (audit PT-1 / PT-7). Absent or status "off" = today's screen. */
  jobFit?: JobFitState;
  onRetryJobFit?: () => void;
  /** Only where the host can open the car's page (Vehicles). */
  onLinkCar?: () => void;
  /** "Show all jobs" pressed (shared with the group screen). */
  showAllJobs?: boolean;
  onToggleShowAllJobs?: () => void;
  /** Groups that already hold a ticked / added job stay visible even if nothing else fits. */
  keepGroupIds?: string[];
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
  jobFit = { status: "off" },
  onRetryJobFit,
  onLinkCar,
  showAllJobs = false,
  onToggleShowAllJobs,
  keepGroupIds = [],
}: LogServiceWhatWasDoneStepProps) {
  const fitOn = jobFit.status === "known";
  const groupCounts = useMemo(
    () => new Map(quickJobs.map((g) => [g.id, groupFitCounts(jobFit, g.id, allJobs)])),
    [quickJobs, jobFit, allJobs],
  );
  const hiddenGroupIds = new Set(
    fitOn
      ? quickJobs
          .filter((g) => (groupCounts.get(g.id)?.fit ?? 0) === 0 && !keepGroupIds.includes(g.id))
          .map((g) => g.id)
      : [],
  );
  const hiddenJobCount = fitOn
    ? quickJobs.reduce((n, g) => n + (groupCounts.get(g.id)?.hidden ?? 0), 0)
    : 0;
  const visibleGroups = quickJobs.filter((g) => !hiddenGroupIds.has(g.id));
  const notUsualGroups = quickJobs.filter((g) => hiddenGroupIds.has(g.id));
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

  // Stitch powertrain 01 / 04 / 05 / 09 / 10: banner, group tiles, Show all. Search, service packages and the
  // inspection card are not in the design and are not in the audit's Add list (playbook Step 4.3 / 4.5).
  void sortedPackages;
  void searchHits;
  void pickHit;
  return (
    <div className="flex flex-col gap-4" data-testid="log-service-step2">
      {jobFit.status === "unknown" ? <UnknownEngineBanner onLinkCar={onLinkCar} /> : null}
      {jobFit.status === "error" && onRetryJobFit ? <CouldNotCheckBanner onRetry={onRetryJobFit} /> : null}
      {fitOn ? <FitBanner pill={powertrainPill(jobFit) ?? ""} variant="tabs" /> : null}
      {fitOn && !showAllJobs ? (
        <GroupsRemovedCaption
          names={notUsualGroups.map((g) => g.name)}
          hidden={notUsualGroups.reduce((n, g) => n + (groupCounts.get(g.id)?.hidden ?? 0), 0)}
        />
      ) : null}
      {quickJobsLoading || jobFit.status === "loading" ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1" aria-busy="true" aria-label="Loading" data-testid="group-grid-loading">
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className={`h-[52px] rounded-lg animate-pulse ${LS.low}`} />
          ))}
        </div>
      ) : quickJobs.length === 0 ? (
        <p className={`${LT.bodySm} ${LS.outline} py-2`}>No groups available.</p>
      ) : (
        <>
          {/* Screen 04 tabs, nothing picked yet (the separate tiles screen was removed, owner 16 Nov). */}
          <GroupTabs
            groups={fitOn && showAllJobs ? [...visibleGroups, ...notUsualGroups] : visibleGroups}
            selectedId={null}
            onPick={onPickSystem}
            greyIds={new Set(notUsualGroups.map((g) => g.id))}
          />
          <div className={`w-full rounded-xl p-6 flex flex-col items-center gap-1 text-center ${LS.low}`} data-testid="group-jobs-panel">
            <span className={`${LT.titleSm} ${LS.text}`}>Pick a group</span>
            <span className={`${LT.bodySm} ${LS.muted}`}>Its jobs open here.</span>
          </div>
          {fitOn && onToggleShowAllJobs ? (
            <ShowAllButton shown={showAllJobs} hidden={hiddenJobCount} onToggle={onToggleShowAllJobs} />
          ) : null}
        </>
      )}
    </div>
  );
}

