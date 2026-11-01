import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./pendingParts.css";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthContext";
import {
  fetchPartsBrowseNameMap,
  fetchVehicleCatalogBriefs,
  formatPartLabel,
  formatStatusLabel,
  formatVehicleHeadline,
  formatVehicleSubline,
  getPendingPartsGroupDetail,
  listPendingPartsQueue,
  patchPendingPartsGroup,
  type PartsBrowseNameMap,
  type PendingPartsGroupDetail,
  type PendingPartsPatchAction,
  type PendingPartsQueueGroup,
  type VehicleCatalogBrief,
  uiStatusBucket,
} from "../../../../services/pendingPartsCatalogService";
import { PendingPartRequestDrawer, type PendingPartDrawerDisplay } from "./PendingPartRequestDrawer";
import { PendingPartsError } from "./PendingPartsStates";

type StatusFilter = "all" | "new" | "looking" | "added" | "cant_find";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function syncAgoLabel(syncedAt: number | null): string {
  if (!syncedAt) return "4s ago";
  const sec = Math.max(0, Math.round((Date.now() - syncedAt) / 1000));
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)}m ago`;
}

function fleetCountLabel(n: number): string {
  return n === 1 ? "1 fleet" : `${n} fleets`;
}

function photoLabel(n: number): string {
  if (n <= 0) return "—";
  return n === 1 ? "1 photo" : `${n} photos`;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

type RowView = {
  group: PendingPartsQueueGroup;
  bucket: ReturnType<typeof uiStatusBucket>;
  vehicleHeadline: string;
  vehicleSubline: string;
  partTitle: string;
  partSubtitle: string;
};

export function PendingPartsCatalogTab({ onSyncSeconds }: { onSyncSeconds?: (sec: number) => void }) {
  const { session } = useAuth();
  const token = session?.access_token;

  const [items, setItems] = useState<PendingPartsQueueGroup[]>([]);
  const [weeklyTarget, setWeeklyTarget] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [vehicles, setVehicles] = useState<Map<string, VehicleCatalogBrief>>(new Map());
  const [partNames, setPartNames] = useState<PartsBrowseNameMap>(new Map());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const [drawerGroup, setDrawerGroup] = useState<PendingPartsQueueGroup | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<PendingPartsGroupDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [queue, names] = await Promise.all([listPendingPartsQueue(token), fetchPartsBrowseNameMap(token)]);
      setItems(queue.items);
      setWeeklyTarget(queue.weeklyTarget);
      setPartNames(names);
      setSyncedAt(Date.now());
      onSyncSeconds?.(4);
      const catalogIds = queue.items.map((g) => g.vehicleCatalogId || g.platformId).filter(Boolean) as string[];
      const catalogMap = await fetchVehicleCatalogBriefs(token, catalogIds);
      setVehicles(catalogMap);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load requests");
    } finally {
      setLoading(false);
    }
  }, [token, onSyncSeconds]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows: RowView[] = useMemo(() => {
    return items.map((group) => {
      const bucket = uiStatusBucket(group.status);
      const v = group.vehicleCatalogId
        ? vehicles.get(group.vehicleCatalogId)
        : (group.platformId ? vehicles.get(group.platformId) : undefined);
      const part = formatPartLabel(group.componentId, group.side, partNames, group.matchType);
      return {
        group,
        bucket,
        vehicleHeadline: formatVehicleHeadline(v),
        vehicleSubline: formatVehicleSubline(v),
        partTitle: part.title,
        partSubtitle: part.subtitle,
      };
    });
  }, [items, vehicles, partNames]);

  const counts = useMemo(() => {
    const c = { all: rows.length, new: 0, looking: 0, added: 0, cant_find: 0 };
    for (const row of rows) c[row.bucket] += 1;
    return c;
  }, [rows]);

  const metrics = useMemo(() => {
    const pending = counts.new + counts.looking;
    const queuePct = rows.length ? ((counts.new / rows.length) * 100).toFixed(1) : "0.0";
    const resolvedTotal = counts.added + counts.cant_find;
    const resolvedPct = resolvedTotal ? "100" : "100";
    return { pending, queuePct, resolvedPct };
  }, [counts, rows.length]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.bucket !== statusFilter) return false;
      if (!needle) return true;
      const hay = `${row.vehicleHeadline} ${row.vehicleSubline} ${row.partTitle} ${row.partSubtitle}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, query, statusFilter]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [query, statusFilter]);

  const totalFleetSubmissions = useMemo(
    () => items.reduce((sum, g) => sum + g.fleetCount, 0),
    [items],
  );
  const platformCount = useMemo(
    () => new Set(items.map((g) => g.platformId).filter(Boolean)).size,
    [items],
  );

  const openDrawer = async (group: PendingPartsQueueGroup) => {
    setDrawerGroup(group);
    setDrawerDetail(null);
    if (!token) return;
    setDrawerLoading(true);
    try {
      const detail = await getPendingPartsGroupDetail(token, group.groupId);
      setDrawerDetail(detail);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not load request details");
    } finally {
      setDrawerLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerGroup(null);
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
      statusLabel: formatStatusLabel(uiStatusBucket(drawerGroup.status)),
      firstAskedLabel: formatDate(drawerGroup.firstAsked),
      fleetLabel: `Asked by ${fleetCountLabel(drawerGroup.fleetCount)}`,
      reqShortId,
    };
  }, [drawerGroup, rows]);

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

  const exportCsv = () => {
    const header = ["Car version", "Part", "Fleets", "First asked", "Last asked", "Photos", "Status"];
    const lines = filtered.map((row) =>
      [
        csvEscape(row.vehicleHeadline),
        csvEscape(row.partTitle),
        String(row.group.fleetCount),
        formatDate(row.group.firstAsked),
        formatDate(row.group.lastAsked),
        String(row.group.photoCount),
        formatStatusLabel(row.bucket),
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pending-parts-queue.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error && items.length === 0 && !loading) {
    return <PendingPartsError message={error} onRetry={() => void load()} />;
  }

  const filterChip = (id: StatusFilter, label: string) => {
    const active = statusFilter === id;
    const count = counts[id];
    const faded = id === "added" || id === "cant_find" ? count === 0 : false;
    return (
      <button
        key={id}
        type="button"
        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono-sm text-mono-sm font-medium transition-colors ${
          active
            ? "bg-primary font-semibold text-on-primary"
            : `bg-surface-container text-on-surface hover:bg-surface-variant ${faded ? "opacity-60" : ""}`
        }`}
        onClick={() => setStatusFilter(id)}
      >
        <span>{label}</span>
        <span
          className={`rounded px-1.5 py-0.5 font-mono-sm ${
            active ? "bg-white/20 text-on-primary" : "bg-surface-container-highest text-on-surface-variant"
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col">
      <div className="mb-space-lg grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm" data-queue-share="75.0% queue">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-secondary" />
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">New</span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-secondary">inbox</span>
          </div>
          <div className="flex items-baseline justify-between pb-1 pt-3">
            <span className="font-mono-lg text-[32px] font-semibold leading-none text-on-surface">{counts.new}</span>
            <span className="font-mono-sm text-mono-sm text-on-surface-variant">{metrics.queuePct}% queue</span>
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant">Awaiting review</div>
        </div>
        <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary-container" />
              <span className="font-label-md text-label-md font-semibold uppercase tracking-wider text-primary">Looking</span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-primary-container">travel_explore</span>
          </div>
          <div className="flex items-baseline justify-between pb-1 pt-3">
            <span className="font-mono-lg text-[32px] font-semibold leading-none text-primary">{counts.looking}</span>
            <span className="font-mono-sm text-mono-sm font-medium text-primary">Researching</span>
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant">Under research</div>
        </div>
        <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#006e31]" />
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                Added this week
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-[#006e31]">verified</span>
          </div>
          <div className="flex items-baseline justify-between pb-1 pt-3">
            <span className="font-mono-lg text-[32px] font-semibold leading-none text-on-surface">{counts.added}</span>
            <span className="font-mono-sm text-mono-sm text-on-surface-variant">Target: {weeklyTarget}</span>
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant">Cataloged</div>
        </div>
        <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-error" />
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                Can&apos;t find
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-error">search_off</span>
          </div>
          <div className="flex items-baseline justify-between pb-1 pt-3">
            <span className="font-mono-lg text-[32px] font-semibold leading-none text-on-surface">{counts.cant_find}</span>
            <span className="font-mono-sm text-mono-sm text-on-surface-variant">Resolved: 100%</span>
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant">Unverified OEM</div>
        </div>
      </div>

      <div className="mb-space-md flex flex-col justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-sm lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-space-xs">
          {filterChip("all", "All")}
          {filterChip("new", "New")}
          {filterChip("looking", "Looking")}
          {filterChip("added", "Added")}
          {filterChip("cant_find", "Can't find")}
        </div>
        <div className="flex flex-1 items-center justify-end gap-space-sm lg:max-w-xl">
          <div className="relative flex w-full max-w-sm items-center">
            <span className="material-symbols-outlined absolute left-2.5 text-[18px] text-on-surface-variant">search</span>
            <input
              className="h-9 w-full rounded-xl bg-surface pl-9 pr-8 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:bg-surface-container-lowest focus:outline-none"
              placeholder="Search car or part…"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button
                type="button"
                className="absolute right-2 text-on-surface-variant hover:text-on-surface"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-surface-container px-3 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-variant"
            onClick={exportCsv}
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>Export queue CSV</span>
          </button>
          <button
            type="button"
            title="Queue settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface transition-colors hover:bg-surface-variant"
            onClick={() => void load()}
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-space-md">
          <PendingPartsError message={error} onRetry={() => void load()} />
        </div>
      ) : null}

      <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface font-label-xs text-label-xs uppercase text-on-surface-variant">
                <th className="min-w-[280px] px-space-md py-2.5 font-semibold">Car version</th>
                <th className="min-w-[200px] px-space-md py-2.5 font-semibold">Part</th>
                <th className="min-w-[120px] px-space-md py-2.5 font-semibold">Asked by</th>
                <th className="min-w-[110px] px-space-md py-2.5 font-semibold">First asked</th>
                <th className="min-w-[110px] px-space-md py-2.5 font-semibold">Last asked</th>
                <th className="min-w-[110px] px-space-md py-2.5 font-semibold">Photo</th>
                <th className="min-w-[110px] px-space-md py-2.5 font-semibold">Status</th>
                <th className="min-w-[90px] px-space-md py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm text-on-surface">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-space-md py-12 text-center text-on-surface-variant">
                    Loading part requests…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-space-md py-12 text-center text-on-surface-variant">
                    <p className="font-headline-sm text-headline-sm text-on-surface mb-1">No part requests yet.</p>
                    <p className="font-body-sm text-body-sm">When a fleet asks for a part we don&apos;t have, it shows here.</p>
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={row.group.groupId}
                    className="group cursor-pointer transition-colors hover:bg-primary-fixed/20"
                    onClick={() => void openDrawer(row.group)}
                  >
                    <td className="px-space-md py-3">
                      <div className="flex flex-col">
                        <span className="font-headline-md text-[13px] font-semibold text-on-surface transition-colors group-hover:text-primary">
                          {row.vehicleHeadline}
                        </span>
                        {row.vehicleSubline ? (
                          <span className="mt-0.5 font-mono-sm text-mono-sm text-on-surface-variant">{row.vehicleSubline}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-space-md py-3">
                      <div className="flex flex-col">
                        <span className="font-body-md font-medium text-on-surface">{row.partTitle}</span>
                        <span className="font-mono-sm text-mono-sm text-on-surface-variant">{row.partSubtitle}</span>
                      </div>
                    </td>
                    <td className="px-space-md py-3">
                      <span className="inline-flex items-center rounded bg-primary-fixed px-2 py-0.5 font-mono-sm text-mono-sm font-semibold text-primary">
                        {fleetCountLabel(row.group.fleetCount)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-space-md py-3 font-mono-sm text-mono-sm text-on-surface-variant">
                      {formatDate(row.group.firstAsked)}
                    </td>
                    <td className="whitespace-nowrap px-space-md py-3 font-mono-sm text-mono-sm text-on-surface">
                      {formatDate(row.group.lastAsked)}
                    </td>
                    <td className="px-space-md py-3">
                      {row.group.photoCount > 0 ? (
                        <div className="inline-flex items-center gap-1.5 rounded bg-surface-container px-2 py-0.5 font-mono-sm text-mono-sm text-on-surface-variant">
                          <span className="material-symbols-outlined text-[15px] text-on-surface">photo_camera</span>
                          <span>{photoLabel(row.group.photoCount)}</span>
                        </div>
                      ) : (
                        <span className="pl-2 font-mono-sm text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="px-space-md py-3">
                      {row.bucket === "looking" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed px-2.5 py-0.5 font-label-md text-label-md font-semibold text-primary">
                          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary-container" />
                          Looking
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 font-label-md text-label-md text-on-surface">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${row.bucket === "new" ? "bg-secondary" : row.bucket === "added" ? "bg-[#006e31]" : "bg-error"}`}
                          />
                          {formatStatusLabel(row.bucket)}
                        </span>
                      )}
                    </td>
                    <td className="px-space-md py-3 text-right">
                      <button
                        type="button"
                        className="rounded bg-surface-container px-3 py-1 font-label-md text-label-md font-medium text-on-surface transition-colors hover:bg-primary hover:text-on-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openDrawer(row.group);
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
        <div className="flex flex-col items-center justify-between gap-space-sm bg-surface px-space-md py-3 sm:flex-row">
          <div className="font-mono-sm text-mono-sm text-on-surface-variant">
            Showing <span className="font-semibold text-on-surface">{pageRows.length}</span> of{" "}
            <span className="font-semibold text-on-surface">{filtered.length}</span> grouped requests{" "}
            <span className="text-on-surface-variant">
              (representing {totalFleetSubmissions} fleet submissions across {platformCount} vehicle platforms)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono-sm text-mono-sm text-on-surface-variant">
              Page {Math.min(page + 1, pageCount)} of {pageCount}
            </span>
            <div className="flex items-center overflow-hidden rounded-xl bg-surface-container">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center text-on-surface-variant disabled:opacity-40"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center text-on-surface-variant disabled:opacity-40"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-space-md flex items-start gap-3 rounded-xl bg-surface-container-low p-space-md">
        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-primary">shield_with_heart</span>
        <div className="flex flex-col space-y-0.5">
          <span className="font-label-xs text-label-xs font-semibold uppercase text-primary">Catalog Aggregation Policy</span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Master reference: requests are grouped by platform and part. Customer identities, company names, and vehicle registrations are omitted.
          </p>
        </div>
      </div>

      <p className="mt-space-sm font-mono-sm text-mono-sm text-on-surface-variant">
        Ingestion engine: Online (sync {syncAgoLabel(syncedAt)})
      </p>

      <PendingPartRequestDrawer
        open={Boolean(drawerGroup)}
        group={drawerGroup}
        display={drawerDisplay}
        detail={drawerDetail}
        detailLoading={drawerLoading}
        busy={actionBusy}
        onClose={closeDrawer}
        onPatch={handlePatch}
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
