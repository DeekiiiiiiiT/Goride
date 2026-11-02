// Stitch: dominion-redesign/parts_import_ledger_drawer
import { useMemo, useState } from "react";
import { ImportBatchDrawer } from "./ImportBatchDrawer";
import { ImportUndoDialog } from "./ImportUndoDialog";
import { ImportStates } from "./ImportStates";
import { MaterialIcon } from "./MaterialIcon";
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
  const reasons = row.undo_blocked_reasons as unknown[] | undefined;
  if (Array.isArray(reasons) && reasons.length > 0) {
    return (
      <span>
        {base}{" "}
        <span className="text-[#b45309]">{reasons.length} fits changed later</span>
      </span>
    );
  }
  return base;
}

export function ImportLedger({
  areas,
  items,
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

  const integrityPct =
    items.length === 0
      ? 100
      : Math.round(
          (100 *
            items.filter((r) => r.status === "imported").length) /
            Math.max(1, items.filter((r) => r.status === "imported" || r.status === "undone").length),
        );

  function openDrawer(row: Record<string, unknown>) {
    setDrawer(row);
    onLoadDrawer?.(row);
  }

  function openUndo(batch: Record<string, unknown>) {
    setUndoTarget(batch);
    setUndoOpen(true);
  }

  const filteredArea = areas?.find((a) => a.id === areaFilter);
  const showEmpty = areaFilter && filtered.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {onBackToAreas ? (
          <button type="button" className="text-sm font-semibold text-secondary inline-flex items-center gap-1" onClick={onBackToAreas}>
            <MaterialIcon name="chevron_left" className="text-[18px]" />
            All areas
          </button>
        ) : null}
        <span className="text-sm font-semibold text-on-surface">/ Import ledger</span>
      </div>
      <p className="text-sm text-on-surface-variant max-w-2xl">
        Audit trail of all domain imports with fitment verification and rollback capabilities. Zero mutation tolerance on
        verified logs.
      </p>
      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="text-sm font-semibold text-secondary" onClick={onExportLedger}>
            Export Full Ledger
          </button>
          <button type="button" className="text-sm font-semibold text-primary" onClick={onNewBatch}>
            New Batch Import
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-mono">
        <span className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40">ACTIVE WORKSPACE DOMINION</span>
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
              disabled={n === 0}
              className={`px-3 py-1 rounded-full text-xs font-semibold ${areaFilter === area.id ? "bg-primary text-on-primary" : "bg-surface-container-low"} ${n === 0 ? "opacity-50" : ""}`}
              onClick={() => setAreaFilter(area.id)}
            >
              {area.name} {n}
            </button>
          );
        })}
        <button type="button" className="text-xs font-semibold text-secondary ml-auto" onClick={onSync}>
          Sync
        </button>
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
            <button type="button" className="font-semibold text-secondary" onClick={onSync}>
              Sync
            </button>
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
                      <button type="button" className="text-error font-semibold" onClick={() => openUndo(row)}>
                        Undo
                      </button>
                    ) : (
                      <span className="text-outline">—</span>
                    )}
                    <button type="button" className="text-secondary font-semibold" onClick={() => openDrawer(row)}>
                      View drawer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-2 text-[10px] font-mono text-outline border-t border-outline-variant/20">
            PARSER ENGINE: STRICT V2 · INTEGRITY VERIFIED: {integrityPct}% · Showing {filtered.length} of {items.length} batches
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
        partsCount={Number(undoTarget?.parts_created ?? 0)}
        fitsCount={Number(undoTarget?.fits_created ?? 0)}
        previousBatchCode={undoTarget?.previous_batch_code ? String(undoTarget.previous_batch_code) : null}
        confirming={undoConfirming}
        onCancel={() => { setUndoOpen(false); setUndoTarget(null); }}
        onConfirm={() => {
          if (!undoTarget) return;
          setUndoConfirming(true);
          Promise.resolve(onUndoBatch?.(undoTarget)).finally(() => {
            setUndoConfirming(false);
            setUndoOpen(false);
            setUndoTarget(null);
            setDrawer(null);
          });
        }}
      />
    </div>
  );
}
