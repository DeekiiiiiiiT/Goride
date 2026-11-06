// Stitch: dominion-redesign/parts_import_ledger_drawer
import { useMemo, useState } from "react";
import { ImportBatchDrawer } from "./ImportBatchDrawer";
import { ImportUndoDialog } from "./ImportUndoDialog";
import { ImportStates } from "./ImportStates";
import { MaterialIcon } from "./MaterialIcon";
import { PartsButton } from "../PartsButton";
import type { ImportAreaSummary } from "./partsImportApi";

export { ImportBatchDrawer } from "./ImportBatchDrawer";
export { ImportUndoDialog } from "./ImportUndoDialog";

function statusChip(status: string) {
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    imported: "bg-[#dcfce7] text-[#166534]",
    undone: "bg-surface-container-high text-on-surface-variant",
    failed: "bg-error-container text-error",
    checked: "bg-primary-fixed/30 text-primary",
  };
  const label = s === "imported" ? "Imported" : s === "undone" ? "Undone" : s === "failed" ? "Failed" : s === "checked" ? "Checked" : status;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase ${map[s] ?? "bg-surface-container-high"}`}>
      {label}
    </span>
  );
}

function rowsBreakdown(row: Record<string, unknown>) {
  if (row.status === "failed") return "Could not read this file";
  const parts = [
    `${Number(row.rows_valid ?? 0)} ready`,
    `${Number(row.rows_error ?? 0)} errors`,
    `${Number(row.rows_duplicate ?? 0)} dupes`,
  ];
  return parts.join(" · ");
}

function changesCell(row: Record<string, unknown>) {
  const base = `${Number(row.parts_created ?? 0)} parts · ${Number(row.fits_created ?? 0)} fits`;
  const matchesCreated = Number(row.matches_created ?? 0);
  const matchesNeedChecking = Number(row.matches_need_checking ?? 0);
  const matchLine =
    matchesCreated > 0 || matchesNeedChecking > 0
      ? `${matchesCreated} matches created · ${matchesNeedChecking} need checking`
      : null;
  const reasons = row.undo_blocked_reasons as unknown[] | undefined;
  if (Array.isArray(reasons) && reasons.length > 0) {
    return (
      <span>
        {base}
        {matchLine ? <> · {matchLine}</> : null}{" "}
        <span className="text-[#b45309]">{reasons.length} fits changed later</span>
      </span>
    );
  }
  if (matchLine) {
    return (
      <span>
        {base} · {matchLine}
      </span>
    );
  }
  return base;
}

function areaIconKey(iconKey?: string | null) {
  const map: Record<string, string> = {
    brakes: "album",
    tires: "tire_repair",
    belts: "cable",
    suspension: "swap_driving_apps",
    transmission: "motion_sensor_active",
    hvac: "air",
    lighting: "lightbulb",
  };
  return map[iconKey ?? ""] ?? "category";
}

export function ImportLedger({
  areas,
  items,
  ledgerMeta,
  onBackToAreas,
  onNewBatch,
  onExportLedger,
  onSync,
  onDownloadFailed,
  onUndoBatch,
  onLoadDrawer,
  drawerChanges,
  drawerUndoBlocked,
  onConflictLink,
}: {
  areas?: ImportAreaSummary[];
  items: Array<Record<string, unknown>>;
  ledgerMeta?: { engineVersion?: string | null; integrityRatio?: number | null; workspaceId?: string | null };
  onBackToAreas?: () => void;
  onNewBatch: () => void;
  onExportLedger?: () => void;
  onSync?: () => void;
  onDownloadFailed?: (batch: Record<string, unknown>) => void;
  onUndoBatch?: (batch: Record<string, unknown>) => void;
  onLoadDrawer?: (batch: Record<string, unknown>) => void;
  drawerChanges?: { parts: Array<Record<string, unknown>>; fits: Array<Record<string, unknown>>; leftOut: Array<Record<string, unknown>> } | null;
  drawerUndoBlocked?: { batchCode: string; conflictCount: number; reasons: Array<{ line?: number | null; reason?: string }> };
  onConflictLink?: (line: number) => void;
}) {
  const [drawer, setDrawer] = useState<Record<string, unknown> | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoTarget, setUndoTarget] = useState<Record<string, unknown> | null>(null);
  const [undoConfirming, setUndoConfirming] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [textFilter, setTextFilter] = useState("");

  const areaCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of items) {
      const id = String(row.area_id ?? "");
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (areaFilter) list = list.filter((r) => String(r.area_id) === areaFilter);
    const q = textFilter.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          String(r.file_name ?? "").toLowerCase().includes(q) ||
          String(r.code ?? "").toLowerCase().includes(q) ||
          String(r.area_name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, areaFilter, textFilter]);

  const integrityLabel = useMemo(() => {
    const ratio = ledgerMeta?.integrityRatio;
    if (ratio == null || Number.isNaN(Number(ratio))) return "—";
    return `${Math.round(Number(ratio) * 100)}%`;
  }, [ledgerMeta?.integrityRatio]);

  const workspaceLabel =
    ledgerMeta?.workspaceId?.trim() ||
    (import.meta.env.VITE_DOMINION_WORKSPACE_ID as string | undefined)?.trim() ||
    "DOMINION";

  const parserEngine = ledgerMeta?.engineVersion?.trim() || "—";

  function openDrawer(row: Record<string, unknown>) {
    setDrawer(row);
    onLoadDrawer?.(row);
  }

  function openUndo(batch: Record<string, unknown>) {
    setUndoTarget(batch);
    setUndoError(null);
    setUndoOpen(true);
  }

  const filteredArea = areas?.find((a) => a.id === areaFilter);
  const showEmpty = areaFilter && filtered.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {onBackToAreas ? (
          <PartsButton variant="secondary" className="text-sm inline-flex items-center gap-1" onClick={onBackToAreas}>
            <MaterialIcon name="chevron_left" className="text-[18px]" />
            All areas
          </PartsButton>
        ) : null}
        <span className="text-sm font-semibold text-on-surface">/ Import ledger</span>
      </div>
      <p className="text-sm text-on-surface-variant max-w-2xl">
        Audit trail of all domain imports with fitment verification and rollback capabilities. Zero mutation tolerance on
        verified logs.
      </p>
      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <PartsButton variant="secondary" className="text-sm" onClick={onExportLedger}>
            Export Full Ledger
          </PartsButton>
          <PartsButton variant="primary" className="text-sm" onClick={onNewBatch}>
            New Batch Import
          </PartsButton>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-mono">
        <span className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40">
          ACTIVE WORKSPACE {workspaceLabel}
        </span>
        <span className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40">ROLLBACK WINDOW 72H ACTIVE</span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          className={`px-3 py-1 rounded-full text-xs font-semibold ${!areaFilter ? "bg-primary text-on-primary" : "bg-surface-container-low"}`}
          onClick={() => setAreaFilter("")}
        >
          All areas {items.length}
        </button>
        {(areas ?? []).map((area) => {
          const n = areaCounts.get(area.id) ?? 0;
          return (
            <button
              key={area.id}
              type="button"
              className={`px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${areaFilter === area.id ? "bg-primary text-on-primary" : "bg-surface-container-low"}`}
              onClick={() => setAreaFilter(area.id)}
            >
              <MaterialIcon name={areaIconKey(area.iconKey)} className="text-[14px]" />
              {area.name} {n}
            </button>
          );
        })}
        <PartsButton variant="secondary" className="text-xs ml-auto" onClick={onSync}>
          Sync
        </PartsButton>
      </div>

      <div className="relative max-w-md">
        <MaterialIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline" />
        <input
          className="w-full h-9 pl-9 pr-3 rounded-xl border border-outline-variant text-sm"
          placeholder="Filter batches or files…"
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
        />
      </div>

      {showEmpty && filteredArea ? (
        <ImportStates
          mode="empty"
          areaName={filteredArea.name}
          areaCode={filteredArea.opCode ?? undefined}
          partTypes={filteredArea.partTypes}
          onStartImport={onNewBatch}
        />
      ) : (
        <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
          <div className="flex flex-wrap justify-between gap-2 p-3 bg-surface-container-low text-xs font-mono">
            <span>{filtered.length} Records Displayed</span>
            <PartsButton variant="secondary" className="text-xs" onClick={onSync}>
              Sync
            </PartsButton>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-outline font-mono uppercase bg-surface-container-high">
                <th className="p-2">Date / Time</th>
                <th className="p-2">Area</th>
                <th className="p-2">File Name</th>
                <th className="p-2">By</th>
                <th className="p-2">Rows Breakdown</th>
                <th className="p-2">Changes</th>
                <th className="p-2">Batch Status</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={String(row.id)} className="border-t border-outline-variant/20">
                  <td className="p-2">{row.promoted_at ? new Date(String(row.promoted_at)).toLocaleString() : row.created_at ? new Date(String(row.created_at)).toLocaleString() : "—"}</td>
                  <td className="p-2">{String(row.area_name ?? "")}</td>
                  <td className="p-2 font-mono">{String(row.file_name ?? "")}</td>
                  <td className="p-2">{String(row.promoted_by_name ?? row.imported_by ?? "—")}</td>
                  <td className="p-2">{rowsBreakdown(row)}</td>
                  <td className="p-2">{changesCell(row)}</td>
                  <td className="p-2">{statusChip(String(row.status ?? ""))}</td>
                  <td className="p-2 space-x-2 whitespace-nowrap">
                    {row.undo_open === true ? (
                      <PartsButton variant="danger" className="min-h-[32px] h-8 px-2" onClick={() => openUndo(row)}>
                        Undo
                      </PartsButton>
                    ) : (
                      <span className="text-outline">—</span>
                    )}
                    <PartsButton variant="secondary" className="min-h-[32px] h-8 px-2" onClick={() => openDrawer(row)}>
                      View drawer
                    </PartsButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-2 text-[10px] font-mono text-outline border-t border-outline-variant/20">
            PARSER ENGINE: {parserEngine} · INTEGRITY VERIFIED: {integrityLabel} · Showing {filtered.length} of {items.length} batches
          </p>
        </div>
      )}

      <ImportBatchDrawer
        batch={drawer}
        areaName={drawer ? String(drawer.area_name ?? "") : undefined}
        changes={drawerChanges ?? undefined}
        undoBlocked={drawerUndoBlocked}
        onClose={() => setDrawer(null)}
        onDownloadFailed={() => { if (drawer) onDownloadFailed?.(drawer); }}
        onUndo={() => { if (drawer) openUndo(drawer); }}
        onConflictLink={onConflictLink}
      />
      <ImportUndoDialog
        open={undoOpen}
        areaName={String(undoTarget?.area_name ?? "Area")}
        fileName={undoTarget?.file_name ? String(undoTarget.file_name) : undefined}
        fileDateLabel={
          undoTarget?.promoted_at
            ? new Date(String(undoTarget.promoted_at)).toLocaleDateString()
            : undoTarget?.created_at
              ? new Date(String(undoTarget.created_at)).toLocaleDateString()
              : undefined
        }
        partsCount={Number(undoTarget?.parts_created ?? 0)}
        fitsCount={Number(undoTarget?.fits_created ?? 0)}
        previousBatchCode={undoTarget?.previous_batch_code ? String(undoTarget.previous_batch_code) : null}
        errorMessage={undoError}
        confirming={undoConfirming}
        onCancel={() => {
          if (undoConfirming) return;
          setUndoOpen(false);
          setUndoTarget(null);
          setUndoError(null);
        }}
        onConfirm={() => {
          if (!undoTarget) return;
          setUndoConfirming(true);
          setUndoError(null);
          void Promise.resolve(onUndoBatch?.(undoTarget))
            .then(() => {
              setUndoOpen(false);
              setUndoTarget(null);
              setDrawer(null);
              onSync?.();
            })
            .catch((e) => {
              setUndoError(e instanceof Error ? e.message : "Undo failed");
            })
            .finally(() => {
              setUndoConfirming(false);
            });
        }}
      />
    </div>
  );
}
