// Stitch: dominion-redesign/parts_import_ledger_drawer
import { useState } from "react";
import { ImportBatchDrawer } from "./ImportBatchDrawer";
import { ImportUndoDialog } from "./ImportUndoDialog";

export { ImportBatchDrawer } from "./ImportBatchDrawer";
export { ImportUndoDialog } from "./ImportUndoDialog";

export function ImportLedger({
  items,
  onNewBatch,
  onSelect,
  onExportLedger,
  onDownloadFailed,
  onUndoBatch,
}: {
  items: Array<Record<string, unknown>>;
  onNewBatch: () => void;
  onSelect: (batch: Record<string, unknown>) => void;
  onExportLedger?: () => void;
  onDownloadFailed?: (batch: Record<string, unknown>) => void;
  onUndoBatch?: (batch: Record<string, unknown>) => void;
}) {
  const [drawer, setDrawer] = useState<Record<string, unknown> | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoTarget, setUndoTarget] = useState<Record<string, unknown> | null>(null);

  function openUndo(batch: Record<string, unknown>) {
    setUndoTarget(batch);
    setUndoOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-on-surface">Parts database</span>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-lg font-semibold">Import CSV (Ledger)</h2>
        <div className="flex gap-2">
          <button type="button" className="text-sm font-semibold text-secondary" onClick={onExportLedger}>Export Full Ledger</button>
          <button type="button" className="text-sm font-semibold text-primary" onClick={onNewBatch}>New Batch Import</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-mono">
        <button type="button" className="px-3 py-1 rounded-full bg-primary text-on-primary font-semibold">All areas 3</button>
        <button type="button" className="px-3 py-1 rounded-full bg-surface-container-low">Brakes 2</button>
        <button type="button" className="px-3 py-1 rounded-full bg-surface-container-low">Engine 1</button>
        <button type="button" className="px-3 py-1 rounded-full bg-surface-container-low">Filters 1</button>
        <button type="button" className="px-3 py-1 rounded-full bg-surface-container-low opacity-75">Battery &amp; electrical (0)</button>
        <button type="button" className="px-3 py-1 rounded-full bg-surface-container-low opacity-75">Belts &amp; hoses (0)</button>
        <button type="button" className="px-3 py-1 rounded-full bg-surface-container-low opacity-75">Fluids (0)</button>
        <button type="button" className="px-3 py-1 rounded-full bg-surface-container-low opacity-75">HVAC (0)</button>
        <button type="button" className="px-3 py-1 rounded-full bg-surface-container-low opacity-75">Lighting &amp; visibility (0)</button>
        <button type="button" className="px-3 py-1 rounded-full bg-surface-container-low opacity-75">Suspension &amp; steering (0)</button>
        <button type="button" className="px-3 py-1 rounded-full bg-surface-container-low opacity-75">Tires &amp; wheels (0)</button>
        <button type="button" className="px-3 py-1 rounded-full bg-surface-container-low opacity-75">Transmission (0)</button>
        <button type="button" className="text-secondary font-semibold">Sync</button>
      </div>
      <p className="text-xs font-mono text-outline">ROLLBACK WINDOW 72H ACTIVE</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-outline font-mono uppercase">
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
          {items.map((row) => (
            <tr key={String(row.id)} className="border-t border-outline-variant/20">
              <td className="p-2">{row.promoted_at ? new Date(String(row.promoted_at)).toLocaleString() : "—"}</td>
              <td className="p-2">{String(row.area_name ?? "")}</td>
              <td className="p-2">{String(row.file_name ?? "")}</td>
              <td className="p-2">{String(row.imported_by ?? "—")}</td>
              <td className="p-2 font-mono text-[10px]">Rows breakdown</td>
              <td className="p-2">Changes</td>
              <td className="p-2">{String(row.status)}</td>
              <td className="p-2 space-x-2">
                <button
                  type="button"
                  className="text-secondary font-semibold"
                  onClick={() => { setDrawer(row); onSelect(row); }}
                >
                  View drawer
                </button>
                <button type="button" className="text-error font-semibold" onClick={() => openUndo(row)}>Undo</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs font-mono text-outline">INTEGRITY VERIFIED</p>
      <ImportBatchDrawer
        batch={drawer}
        areaName={drawer ? String(drawer.area_name ?? "") : undefined}
        onClose={() => setDrawer(null)}
        onDownloadFailed={() => { if (drawer) onDownloadFailed?.(drawer); }}
        onUndo={() => { if (drawer) openUndo(drawer); }}
      />
      <ImportUndoDialog
        open={undoOpen}
        areaName={String(undoTarget?.area_name ?? "Area")}
        fileName={String(undoTarget?.file_name ?? "")}
        onCancel={() => { setUndoOpen(false); setUndoTarget(null); }}
        onConfirm={() => {
          if (undoTarget) onUndoBatch?.(undoTarget);
          setUndoOpen(false);
          setUndoTarget(null);
        }}
      />
    </div>
  );
}
