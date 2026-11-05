import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  conflictDetailSummary,
  conflictTypeLabel,
} from "@roam/types/partMatchConflictCopy";
import {
  buildConflictBatchResolveItems,
  firstOpenConflictType,
} from "@roam/types/conflictBatchResolve";
import { conflictGeometryVerification, conflictResolvedFooter } from "@roam/types/conflictDrawerExtras";
import { useAuth } from "../../../auth/AuthContext";
import {
  fetchAutoMatchConflicts,
  fetchConflictHeatmap,
  fetchPartMatchSchedule,
  resolveAutoMatchConflict,
  resolveAutoMatchConflictsBatch,
  unmergeSamePartConflict,
  type MatchConflictRow,
} from "../../../../services/partsAutoMatchApi";
import { ConflictReviewDrawer } from "./ConflictReviewDrawer";
import { BatchResolveRulesModal } from "./BatchResolveRulesModal";

const TYPE_CHIPS: Array<{ id: string; label: string }> = [
  { id: "oe_ambiguous", label: "Same number, two parts" },
  { id: "part_type_mismatch", label: "Wrong part type" },
  { id: "position_side_mismatch", label: "Position or side differs" },
  { id: "index_wear_sensor", label: "Wear sensor differs" },
  { id: "index_merge_proposed", label: "Group merge suggested" },
  { id: "system_link", label: "Whole-system link" },
];

const STATUS_SEGMENTS = [
  { id: "open", label: "Open" },
  { id: "kept", label: "Kept" },
  { id: "removed", label: "Removed" },
  { id: "superseded", label: "No longer applies" },
];

function minutesUntil(iso: string | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return "—";
  return String(Math.max(0, Math.round(ms / 60000)));
}

function formatFoundShort(row: MatchConflictRow): string {
  const iso = String(row.found_at || (row as { computed_at?: string }).computed_at || "");
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function partGroupCell(row: MatchConflictRow): string {
  const gc = String(row.group_code || "");
  const pn = String(row.part_name || "");
  if (gc && pn) return `${gc} · ${pn}`;
  return gc || pn || "—";
}

/** Type label for the table cell; one text run so it wraps between words only. */
function conflictTypeTableLabel(_typeKey: string, label: string) {
  return label;
}

function GeometryVerificationThumb({
  imageUrl,
  title,
}: {
  imageUrl?: string | null;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = String(imageUrl || "").trim();
  const showImage = Boolean(src) && !failed;

  if (!showImage) {
    return (
      <div className="am-conflict-geometry-placeholder w-24 h-24 rounded-lg bg-surface-container-high shrink-0 flex flex-col items-center justify-center gap-1 px-1 text-center">
        <span className="material-symbols-outlined text-[28px] text-on-surface-variant">image_not_supported</span>
        <span className="font-label-xs text-label-xs text-on-surface-variant leading-tight">No drawing on file</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      decoding="sync"
      loading="eager"
      className="am-conflict-geometry-image w-24 h-24 rounded-lg object-cover bg-surface-container-high shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

function statusBadge(status: string) {
  if (status === "open") {
    return (
      <span className="am-conflict-status-badge inline-flex items-center gap-1 font-mono-sm text-mono-sm px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-800 font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
        Open
      </span>
    );
  }
  if (status === "kept") {
    return (
      <span className="am-conflict-status-badge am-conflict-badge-kept inline-flex items-center gap-1 font-mono-sm text-mono-sm px-2 py-0.5 rounded-full font-semibold">
        <span className="am-conflict-badge-kept-dot w-1.5 h-1.5 rounded-full" />
        Kept
      </span>
    );
  }
  if (status === "removed") {
    return (
      <span className="am-conflict-status-badge inline-flex items-center gap-1 font-mono-sm text-mono-sm px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant line-through">
        Removed
      </span>
    );
  }
  if (status === "superseded") {
    return (
      <span className="am-conflict-status-badge inline-flex items-center gap-1 font-mono-sm text-mono-sm px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant italic">
        No longer applies
      </span>
    );
  }
  return <span className="font-mono-sm text-mono-sm">{status}</span>;
}

export function AutoMatchConflictsTab({
  onHeaderActions,
}: {
  onHeaderActions?: (node: ReactNode) => void;
}) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const owner = String(session?.user?.app_metadata?.role || "") === "platform_owner";
  const client = useQueryClient();
  const [type, setType] = useState("");
  const [typeInitialized, setTypeInitialized] = useState(false);
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const vehicleFilter = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("vehicle") || "" : "";

  const schedule = useQuery({ queryKey: ["part-match-schedule"], queryFn: () => fetchPartMatchSchedule(token), enabled: Boolean(token) });
  const heatmap = useQuery({ queryKey: ["conflict-heatmap"], queryFn: () => fetchConflictHeatmap(token), enabled: Boolean(token) });
  const list = useQuery({
    queryKey: ["auto-match-conflicts", type, status, search, vehicleFilter],
    queryFn: () => fetchAutoMatchConflicts(token, {
      type: type || undefined,
      status,
      q: search,
      vehicleId: vehicleFilter || undefined,
    }),
    enabled: Boolean(token),
  });

  const rows = list.data?.rows ?? [];
  const totalsByType = list.data?.totalsByType ?? {};
  const totalsByStatus = list.data?.totalsByStatus ?? {};
  const openByType = heatmap.data?.byType ?? totalsByType;
  const openCount = heatmap.data?.openCount ?? totalsByStatus.open ?? 0;
  const drawer = rows.find((r: MatchConflictRow) => String(r.id) === drawerId)
    ?? rows.find((r: MatchConflictRow) => String(r.status) === "open");

  useEffect(() => {
    if (typeInitialized || !heatmap.data) return;
    const first = firstOpenConflictType(openByType, TYPE_CHIPS.map((c) => c.id));
    if (first) setType(first);
    setTypeInitialized(true);
  }, [heatmap.data, openByType, typeInitialized]);

  useEffect(() => {
    if (!drawerId && drawer?.id) setDrawerId(String(drawer.id));
  }, [drawer?.id, drawerId]);

  const pulseMinutes = minutesUntil(schedule.data?.nextRun);

  useEffect(() => {
    if (!onHeaderActions) return;
    onHeaderActions(
      <>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface">
          <span className="material-symbols-outlined text-[16px] text-primary">sync</span>
          <span className="font-mono-sm text-mono-sm whitespace-nowrap">
            ENGINE PULSE: <strong className="text-primary font-semibold">T-MINUS {pulseMinutes}M</strong>
          </span>
        </div>
        <button
          type="button"
          className="auto-match-conflicts-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md shadow-sm hover:opacity-95 transition-opacity disabled:opacity-40"
          disabled={!type}
          onClick={() => setBatchOpen(true)}
        >
          <span className="material-symbols-outlined text-[16px]">rule</span>
          Batch Resolve Rules
        </button>
      </>,
    );
    return () => { onHeaderActions(null); };
  }, [onHeaderActions, pulseMinutes, type]);

  async function resolve(action: "keep" | "remove" | "merge", id = drawerId) {
    if (!id || !note.trim()) {
      toast.message("Add a note for the audit trail.");
      return;
    }
    setBusy(true);
    try {
      await resolveAutoMatchConflict(token, id, action, note.trim());
      toast.success(action === "keep" ? "Kept" : action === "merge" ? "Merged as same part" : "Removed");
      setNote("");
      await client.invalidateQueries({ queryKey: ["auto-match-conflicts"] });
      await client.invalidateQueries({ queryKey: ["conflict-heatmap"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resolve");
    } finally {
      setBusy(false);
    }
  }

  async function unmergeSamePart(id = drawerId) {
    if (!id) return;
    setBusy(true);
    try {
      await unmergeSamePartConflict(token, id);
      toast.success("Merge undone");
      setNote("");
      await client.invalidateQueries({ queryKey: ["auto-match-conflicts"] });
      await client.invalidateQueries({ queryKey: ["conflict-heatmap"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not undo merge");
    } finally {
      setBusy(false);
    }
  }

  async function resolveBatch(action: "keep" | "remove", batchNote: string) {
    if (!type) return;
    const built = buildConflictBatchResolveItems(rows, type, action, batchNote);
    if (!built.ok) {
      toast.message(built.error);
      return;
    }
    setBusy(true);
    try {
      await resolveAutoMatchConflictsBatch(token, built.items);
      toast.success(`Batch ${action === "keep" ? "kept" : "removed"} ${built.items.length} conflicts`);
      setBatchOpen(false);
      setNote("");
      await client.invalidateQueries({ queryKey: ["auto-match-conflicts"] });
      await client.invalidateQueries({ queryKey: ["conflict-heatmap"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Batch resolve failed");
    } finally {
      setBusy(false);
    }
  }

  const statusCounts = useMemo(() => STATUS_SEGMENTS.map((seg) => ({
    ...seg,
    count: totalsByStatus[seg.id] ?? 0,
  })), [totalsByStatus]);

  const heatmapPct = openCount > 0 ? Math.min(99, Math.round((openCount / Math.max(openCount + 1, 5)) * 100)) : 0;

  const geometrySource = drawer ?? rows.find((r) => conflictGeometryVerification(r));
  const geometry = geometrySource ? conflictGeometryVerification(geometrySource) : null;

  const lastResolved = rows.find((r) => {
    const st = String(r.status);
    return (st === "kept" || st === "removed") && conflictResolvedFooter(r);
  });

  const lastResolvedLine = lastResolved ? conflictResolvedFooter(lastResolved) : null;
  const lastResolvedWho = lastResolved ? String((lastResolved as { resolved_by_display?: string }).resolved_by_display || "") : "";

  return (
    <div className="auto-match-conflicts-workspace flex flex-col gap-space-md">
      <BatchResolveRulesModal
        open={batchOpen}
        conflictType={type}
        rows={rows}
        busy={busy}
        onClose={() => setBatchOpen(false)}
        onSubmit={(action, batchNote) => { void resolveBatch(action, batchNote); }}
      />

      <div className="flex flex-wrap items-center gap-space-sm overflow-x-auto pb-1">
        {TYPE_CHIPS.map((chip) => {
          const count = openByType[chip.id] ?? totalsByType[chip.id] ?? 0;
          const active = type === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              className={`am-conflict-type-chip flex items-center gap-2 px-3 py-1.5 rounded-full font-label-md text-label-md whitespace-nowrap ${active ? "am-conflict-type-chip-active bg-primary-fixed text-on-primary-fixed shadow-sm font-semibold" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"}`}
              onClick={() => setType(active ? "" : chip.id)}
            >
              <span>{chip.label}</span>
              <span className={`font-mono-sm text-mono-sm px-1.5 py-0.2 rounded-full ${active ? "bg-primary-container text-on-primary" : "bg-surface-container-high text-outline"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-space-md p-space-sm bg-surface-container-lowest rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center gap-space-xs">
          {statusCounts.map((seg) => (
            <button
              key={seg.id}
              type="button"
              aria-pressed={status === seg.id}
              className={`px-3 py-1 rounded-lg font-label-md text-label-md transition-colors ${status === seg.id ? "bg-surface-container-high text-on-surface font-semibold" : "text-on-surface-variant hover:bg-surface-container-low"}`}
              onClick={() => setStatus(seg.id)}
            >
              {seg.label} ({seg.count})
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-[380px]">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">filter_list</span>
          <input
            className="auto-match-conflicts-search w-full h-8 pl-8 pr-3 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:bg-surface-container-lowest"
            placeholder="Search conflicts by car, number or group…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-start">
        <div className="xl:col-span-7 flex flex-col gap-space-md min-w-0">
          {list.isLoading ? (
            <p className="flex items-center gap-2 text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading conflicts…</p>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden min-w-0">
              <div className="overflow-x-auto">
                <table className="auto-match-conflicts-table w-full text-left table-fixed">
                  <thead>
                    <tr className="bg-surface-container-low font-label-xs text-label-xs text-on-surface-variant uppercase tracking-wider h-9">
                      <th className="am-conflict-th px-3 py-2 w-[14%]">Type</th>
                      <th className="am-conflict-th px-3 py-2 w-[12%]">Car</th>
                      <th className="am-conflict-th px-3 py-2 w-[15%]">Part / group</th>
                      <th className="am-conflict-th px-3 py-2 w-[13%]">Matched number</th>
                      <th className="am-conflict-th px-3 py-2 w-[22%]">Detail</th>
                      <th className="am-conflict-th px-3 py-2 w-[10%]">Found</th>
                      <th className="am-conflict-th px-3 py-2 w-[14%]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant/30">
                    {rows.map((row: MatchConflictRow) => {
                      const st = String(row.status || "");
                      const active = String(row.id) === String(drawer?.id);
                      const typeKey = String(row.conflict_type || "");
                      const typeLabel = conflictTypeLabel(typeKey);
                      return (
                        <tr
                          key={String(row.id)}
                          className={`am-conflict-row cursor-pointer transition-colors ${active ? "am-conflict-row-active bg-primary-fixed/30 hover:bg-primary-fixed/40" : "bg-surface-container-lowest hover:bg-surface-container-low"}`}
                          onClick={() => { setDrawerId(String(row.id)); setNote(""); }}
                        >
                          <td className="px-3 py-3 align-top font-label-md text-label-md font-semibold text-on-surface">
                            <div className={`flex items-center gap-1.5 ${active ? "text-primary" : ""}`}>
                              {active ? <span className="w-1.5 h-1.5 rounded-full bg-primary-container" /> : null}
                              <span className="min-w-0">{conflictTypeTableLabel(typeKey, typeLabel)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top font-mono-sm text-mono-sm font-medium text-on-surface">{String(row.vehicle_label || "—")}</td>
                          <td className="px-3 py-3 align-top font-mono-sm text-mono-sm text-on-surface-variant">{partGroupCell(row)}</td>
                          <td className="px-3 py-3 align-top font-mono-sm text-mono-sm font-semibold text-on-surface">{String(row.matched_key || "—")}</td>
                          <td className="px-3 py-3 align-top text-on-surface-variant max-w-[12rem]">{conflictDetailSummary(row)}</td>
                          <td className="px-3 py-3 align-top font-mono-sm text-mono-sm text-on-surface-variant whitespace-nowrap">{formatFoundShort(row)}</td>
                          <td className="px-3 py-3 align-top">{statusBadge(st)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {lastResolvedLine ? (
                <div className="p-space-md bg-surface-container-low flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm border-t border-outline-variant/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[18px] text-primary shrink-0">verified_user</span>
                    <span className="font-body-sm text-body-sm text-on-surface font-medium">
                      {lastResolvedWho ? (
                        <>
                          Resolved by <strong>{lastResolvedWho}</strong>
                          {(lastResolved as { resolved_at?: string }).resolved_at ? (
                            <>
                              {" "}on{" "}
                              {new Date(String((lastResolved as { resolved_at?: string }).resolved_at)).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </>
                          ) : null}
                          {lastResolved?.resolution_note ? (
                            <>
                              {" "}· <span className="text-on-surface-variant italic">&quot;{String(lastResolved.resolution_note)}&quot;</span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        lastResolvedLine
                      )}
                    </span>
                  </div>
                  <a className="font-mono-sm text-mono-sm text-primary hover:underline font-semibold flex items-center gap-1 shrink-0" href="/?page=activity-log&filter=conflict">
                    View audit trail
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </a>
                </div>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md min-w-0">
            <div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between min-w-0">
              <div className="flex items-center justify-between mb-space-sm gap-2 flex-wrap">
                <span className="am-conflict-section-label font-label-xs text-label-xs uppercase tracking-wider whitespace-normal">Conflict heatmap / Chassis</span>
                <span className="font-mono-sm text-mono-sm text-primary font-bold whitespace-normal">M900 Platform ({heatmapPct}%)</span>
              </div>
              <div className="flex items-center gap-space-md min-w-0">
                <div className="relative w-20 h-20 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36" aria-hidden>
                    <path className="text-surface-container-high" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                    <path className="text-primary-container" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={`${heatmapPct}, 100`} strokeLinecap="round" strokeWidth="4" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono-sm text-mono-sm font-bold text-on-surface">{openCount} / {Math.max(openCount + 1, 5)}</div>
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="font-body-sm text-body-sm text-on-surface font-semibold">Shared Daihatsu/Toyota caliper</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Front brake disc assemblies on M900A, M900S, and M900F share OE casting marks.</p>
                </div>
              </div>
            </div>
            <div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex items-center gap-space-md min-w-0">
              <GeometryVerificationThumb
                imageUrl={geometry?.image_url}
                title={geometry?.title || "Part geometry"}
              />
              <div className="flex flex-col gap-1 min-w-0">
                <span className="am-conflict-section-label font-mono-sm text-mono-sm font-semibold uppercase whitespace-normal">Geometry verification</span>
                <div className="font-body-sm text-body-sm text-on-surface font-semibold whitespace-normal">{geometry?.title || "Akebono AN-761WK Spec"}</div>
                <p className="font-body-sm text-body-sm text-on-surface-variant text-xs whitespace-normal">{geometry?.spec_line || "Width: 108.5mm · Height: 44.0mm · Thickness: 15.0mm. Confirm thickness tolerance before Keep commit."}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-5 flex flex-col gap-space-md min-w-0">
          {drawer ? (
            <ConflictReviewDrawer
              row={drawer}
              note={note}
              busy={busy}
              onNote={setNote}
              onClose={() => setDrawerId(null)}
              onKeep={() => { void resolve("keep"); }}
              onRemove={() => { void resolve("remove"); }}
              onMerge={() => { void resolve("merge"); }}
              onUnmerge={() => { void unmergeSamePart(); }}
              canMergeSamePart={owner}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
