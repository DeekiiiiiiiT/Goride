// Stitch: dominion-redesign/pending_catalog_automated_research_queue_parts_tab
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./pendingParts.css";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthContext";
import {
  downloadCatalogResearchExportCsv,
  fetchCatalogResearchJobs,
  fetchCatalogResearchStrip,
  fetchPartsBrowseNameMap,
  fetchVehicleCatalogBriefs,
  formatPartLabel,
  formatVehicleHeadline,
  formatVehicleSubline,
  getPendingPartsGroupDetail,
  listPendingPartsQueue,
  patchPendingPartsGroup,
  postCatalogResearchJobAction,
  reprocessQueuedJobs,
  type CatalogResearchJobListItem,
  type CatalogResearchStrip,
  type PartsBrowseNameMap,
  type PendingPartsGroupDetail,
  type PendingPartsPatchAction,
  type PendingPartsQueueGroup,
  type VehicleCatalogBrief,
} from "../../../../services/pendingPartsCatalogService";
import { PendingPartRequestDrawer, type PendingPartDrawerDisplay } from "./PendingPartRequestDrawer";
import { PendingResearchHeaderActions, PendingResearchStrip } from "./PendingResearchStrip";
import {
  buildResearchMetricsCards,
  formatResearchStateLabel,
  researchFilterForJobState,
  type ResearchQueueFilter,
} from "./pendingCatalogViewModels";
import { PendingPartsEmpty, PendingPartsError, PendingPartsLoading } from "./PendingPartsStates";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fleetCountLabel(n: number): string {
  return n === 1 ? "1 fleet" : `${n} fleets`;
}

type RowView = {
  group: PendingPartsQueueGroup;
  job: CatalogResearchJobListItem | null;
  filter: ResearchQueueFilter;
  vehicleHeadline: string;
  vehicleSubline: string;
  partTitle: string;
  partSubtitle: string;
  resultLabel: string;
  statusLabel: string;
};

export function PendingPartsCatalogTab({ onSyncSeconds }: { onSyncSeconds?: (sec: number) => void }) {
  const { session } = useAuth();
  const token = session?.access_token;

  const [items, setItems] = useState<PendingPartsQueueGroup[]>([]);
  const [jobs, setJobs] = useState<CatalogResearchJobListItem[]>([]);
  const [strip, setStrip] = useState<CatalogResearchStrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedTraceId, setFailedTraceId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Map<string, VehicleCatalogBrief>>(new Map());
  const [partNames, setPartNames] = useState<PartsBrowseNameMap>(new Map());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ResearchQueueFilter>("all");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const PAGE_SIZE = 25;

  const [drawerGroup, setDrawerGroup] = useState<PendingPartsQueueGroup | null>(null);
  const [drawerJob, setDrawerJob] = useState<CatalogResearchJobListItem | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<PendingPartsGroupDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const jobByGroup = useMemo(() => {
    const map = new Map<string, CatalogResearchJobListItem>();
    for (const job of jobs) map.set(job.groupKey, job);
    return map;
  }, [jobs]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setFailedTraceId(null);
    try {
      const [queue, names, jobList] = await Promise.all([
        listPendingPartsQueue(token),
        fetchPartsBrowseNameMap(token),
        fetchCatalogResearchJobs(token),
      ]);
      setItems(queue.items);
      setPartNames(names);
      setJobs(jobList);
      const failed = jobList.find((j) => j.state === "failed");
      if (failed) setFailedTraceId(failed.jobId.slice(0, 8).toUpperCase());
      onSyncSeconds?.(4);
      const catalogIds = queue.items.map((g) => g.vehicleCatalogId || g.platformId).filter(Boolean) as string[];
      setVehicles(await fetchVehicleCatalogBriefs(token, catalogIds));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load requests");
    } finally {
      setLoading(false);
    }
  }, [token, onSyncSeconds]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => buildResearchMetricsCards(jobs), [jobs]);

  const rows: RowView[] = useMemo(() => {
    return items.map((group) => {
      const job = jobByGroup.get(group.groupId) ?? null;
      const filter = researchFilterForJobState(job?.state) ?? "queued";
      const v = group.vehicleCatalogId
        ? vehicles.get(group.vehicleCatalogId)
        : group.platformId
          ? vehicles.get(group.platformId)
          : undefined;
      const part = formatPartLabel(group.componentId, group.side, partNames, group.matchType);
      const queuedResult = job?.state === "queued" ? "—" : job?.resultPartNumber || "—";
      return {
        group,
        job,
        filter,
        vehicleHeadline: formatVehicleHeadline(v),
        vehicleSubline: formatVehicleSubline(v),
        partTitle: part.title,
        partSubtitle: part.subtitle,
        resultLabel: queuedResult,
        statusLabel: job ? formatResearchStateLabel(job.state) : "Queued",
      };
    });
  }, [items, vehicles, partNames, jobByGroup]);

  const counts = useMemo(() => {
    const c: Record<ResearchQueueFilter, number> = {
      all: rows.length,
      needs_review: 0,
      researching: 0,
      queued: 0,
      auto_added: 0,
      added: 0,
      not_found: 0,
      failed: 0,
    };
    for (const row of rows) c[row.filter] += 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.filter !== statusFilter) return false;
      if (!needle) return true;
      const hay = `${row.vehicleHeadline} ${row.vehicleSubline} ${row.partTitle} ${row.partSubtitle} ${row.resultLabel}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, query, statusFilter]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [query, statusFilter]);

  const openDrawer = async (group: PendingPartsQueueGroup, job: CatalogResearchJobListItem | null) => {
    setDrawerGroup(group);
    setDrawerJob(job);
    setDrawerDetail(null);
    if (!token) return;
    setDrawerLoading(true);
    try {
      setDrawerDetail(await getPendingPartsGroupDetail(token, group.groupId));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not load request details");
    } finally {
      setDrawerLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerGroup(null);
    setDrawerJob(null);
    setDrawerDetail(null);
  };

  const drawerDisplay: PendingPartDrawerDisplay | null = useMemo(() => {
    if (!drawerGroup) return null;
    const row = rows.find((r) => r.group.groupId === drawerGroup.groupId);
    const reqShortId = drawerGroup.requestIds[0]?.slice(0, 8).toUpperCase() || drawerGroup.groupId.slice(0, 8).toUpperCase();
    return {
      partTitle: row?.partTitle || "Part request",
      vehicleHeadline: row?.vehicleHeadline || "Unknown vehicle version",
      vehicleSubline: row?.vehicleSubline || "",
      statusLabel: row?.statusLabel || "Queued",
      firstAskedLabel: formatDate(drawerGroup.firstAsked),
      fleetLabel: `Asked by ${fleetCountLabel(drawerGroup.fleetCount)}`,
      reqShortId,
    };
  }, [drawerGroup, rows]);

  const drawerVehicleBrief = useMemo(() => {
    if (!drawerGroup) return null;
    const id = drawerGroup.vehicleCatalogId || drawerGroup.platformId;
    return id ? vehicles.get(id) ?? null : null;
  }, [drawerGroup, vehicles]);

  const handlePatch = async (body: PendingPartsPatchAction) => {
    if (!token || !drawerGroup) return;
    setActionBusy(true);
    try {
      await patchPendingPartsGroup(token, drawerGroup.groupId, body);
      toast.success("Request group updated");
      closeDrawer();
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setActionBusy(false);
    }
  };

  const queuePriority = async () => {
    if (!token) return;
    const target = jobs.find((j) => j.state === "queued") ?? jobs.find((j) => j.state === "needs_review");
    if (!target) {
      toast.message("No queued research job to prioritize");
      return;
    }
    setBusy(true);
    try {
      await postCatalogResearchJobAction(token, target.jobId, "research-next");
      toast.success("Research next queued");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not prioritize");
    } finally {
      setBusy(false);
    }
  };

  const exportAndReprocess = async (mode: "export" | "reprocess") => {
    if (!token) return;
    setBusy(true);
    try {
      if (mode === "export") await downloadCatalogResearchExportCsv(token);
      else {
        const res = await reprocessQueuedJobs(token);
        toast.success(`Requeued ${res.requeued} jobs`);
        await load();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading && items.length === 0) {
    return <PendingPartsLoading />;
  }

  if (error && items.length === 0) {
    return <PendingPartsError message={error} traceId={failedTraceId} onRetry={() => void load()} />;
  }

  const filterChip = (id: ResearchQueueFilter, label: string) => {
    const active = statusFilter === id;
    const count = counts[id];
    return (
      <button
        key={id}
        type="button"
        className={`flex h-8 items-center gap-1.5 rounded-lg px-3 font-body-sm text-body-sm font-medium shadow-sm transition-colors ${
          active
            ? "bg-inverse-surface text-inverse-on-surface"
            : "bg-surface-container-lowest text-secondary hover:bg-surface-container-low hover:text-on-surface"
        }`}
        onClick={() => setStatusFilter(id)}
      >
        <span>
          {label} {count}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col">
      <h1 className="mb-space-md font-headline-lg text-headline-lg font-semibold text-on-surface">Pending catalog</h1>
      <PendingResearchHeaderActions
        token={token}
        strip={strip}
        busy={busy}
        onRefreshStrip={() => {
          if (!token) return;
          void fetchCatalogResearchStrip(token).then(setStrip);
        }}
        onQueuePriority={() => void queuePriority()}
      />
      <PendingResearchStrip token={token} onStripChange={setStrip} />

      <div className="mb-space-lg grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Needs review", value: metrics.needsReview, caption: "Awaiting gate" },
          { label: "Added automatically this week", value: metrics.addedAutoWeek, caption: "Catalog verified" },
          { label: "Added this week", value: metrics.addedWeek, caption: "Total merged" },
          { label: "Couldn't find", value: metrics.couldntFind, caption: "Manual spec needed" },
        ].map((card) => (
          <div
            key={card.label}
            className="relative flex h-28 flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-space-md shadow-sm"
          >
            <span className="font-label-md text-label-md font-semibold uppercase tracking-wider text-secondary">{card.label}</span>
            <div className="flex items-baseline justify-between">
              <span className="font-headline-xl text-headline-xl font-semibold text-on-surface">{card.value}</span>
              <span className="rounded-full bg-surface-container px-2 py-0.5 font-mono-sm text-mono-sm font-semibold text-on-surface-variant">
                {card.caption}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-space-md flex flex-col justify-between gap-space-sm lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-1.5">
          {filterChip("all", "All")}
          {filterChip("needs_review", "Needs review")}
          {filterChip("researching", "Researching")}
          {filterChip("queued", "Queued")}
          {filterChip("auto_added", "Added automatically")}
          {filterChip("added", "Added")}
          {filterChip("not_found", "Couldn't find")}
          {filterChip("failed", "Failed")}
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <div className="relative min-w-[280px] flex-1">
            <span className="material-symbols-outlined absolute left-3 text-[18px] text-secondary">search</span>
            <input
              className="h-9 w-full rounded-xl bg-surface-container-lowest pl-9 pr-3 font-body-sm text-body-sm text-on-surface shadow-sm placeholder:text-outline focus:outline-none"
              placeholder="Search car or part…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-surface-container-low px-3 font-body-sm text-body-sm text-on-surface hover:bg-surface-container"
            disabled={busy}
            onClick={() => void exportAndReprocess("export")}
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Export CSV
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-surface-container-low px-3 font-body-sm text-body-sm text-on-surface hover:bg-surface-container"
            disabled={busy}
            onClick={() => void exportAndReprocess("reprocess")}
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Reprocess All Queued
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-space-md">
          <PendingPartsError message={error} traceId={failedTraceId} onRetry={() => void load()} />
        </div>
      ) : null}

      <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-9 bg-surface-container-low font-label-xs text-label-xs font-semibold uppercase tracking-wider text-secondary">
                <th className="px-space-md py-2">Car version</th>
                <th className="px-space-md py-2">Part</th>
                <th className="px-space-md py-2">Asked by</th>
                <th className="px-space-md py-2">First asked / Last asked</th>
                <th className="px-space-md py-2">Status</th>
                <th className="px-space-md py-2">Result</th>
                <th className="px-space-md py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm text-on-surface">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-space-md py-12 text-center text-on-surface-variant">
                    Loading…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-space-lg">
                    <PendingPartsEmpty />
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={row.group.groupId}
                    className="h-14 cursor-pointer transition-colors hover:bg-surface-container-low/50"
                    onClick={() => void openDrawer(row.group, row.job)}
                  >
                    <td className="px-space-md py-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-body-sm font-semibold text-on-surface">{row.vehicleHeadline}</span>
                        {row.vehicleSubline ? (
                          <span className="truncate font-mono-sm text-mono-sm text-secondary">{row.vehicleSubline}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-space-md py-2 font-medium">{row.partTitle}</td>
                    <td className="px-space-md py-2">
                      <span className="inline-flex rounded-full bg-primary-container px-2 py-0.5 font-mono-sm text-mono-sm font-medium text-on-primary">
                        {fleetCountLabel(row.group.fleetCount)}
                      </span>
                    </td>
                    <td className="px-space-md py-2 font-mono-sm text-mono-sm text-secondary">
                      {formatDate(row.group.firstAsked)} / {formatDate(row.group.lastAsked)}
                    </td>
                    <td className="px-space-md py-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 font-mono-sm text-mono-sm font-semibold text-on-surface-variant">
                        <span className="h-1.5 w-1.5 rounded-full bg-outline" />
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-space-md py-2 font-mono-sm text-mono-sm text-on-surface">{row.resultLabel}</td>
                    <td className="px-space-md py-2 text-right">
                      <button
                        type="button"
                        className="rounded-lg bg-surface-container px-3 py-1 font-label-md text-label-md font-medium text-on-surface hover:bg-primary hover:text-on-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openDrawer(row.group, row.job);
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PendingPartRequestDrawer
        open={Boolean(drawerGroup)}
        accessToken={session?.access_token || ""}
        group={drawerGroup}
        job={drawerJob}
        display={drawerDisplay}
        detail={drawerDetail}
        detailLoading={drawerLoading}
        busy={actionBusy}
        vehicleBrief={drawerVehicleBrief}
        partNames={partNames}
        onClose={closeDrawer}
        onPatch={handlePatch}
        onReload={load}
      />
    </div>
  );
}

export function PendingPartsQueueCount({ onCount }: { onCount: (n: number) => void }) {
  const { session } = useAuth();
  const token = session?.access_token;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void listPendingPartsQueue(token)
      .then((res) => {
        if (!cancelled) onCount(res.total);
      })
      .catch(() => {
        if (!cancelled) onCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [token, onCount]);
  return null;
}
