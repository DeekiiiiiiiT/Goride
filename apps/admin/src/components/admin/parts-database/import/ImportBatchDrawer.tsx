// Stitch: dominion-redesign/parts_import_ledger_drawer
export function ImportBatchDrawer({
  batch,
  areaName,
  onClose,
  onDownloadFailed,
  onUndo,
}: {
  batch: Record<string, unknown> | null;
  areaName?: string;
  onClose: () => void;
  onDownloadFailed?: () => void;
  onUndo?: () => void;
}) {
  if (!batch) return null;
  const name = areaName ?? String(batch.area_name ?? "Area");
  return (
    <aside className="fixed inset-y-0 right-0 w-full max-w-md bg-surface-container-lowest shadow-xl p-6 z-40 overflow-y-auto">
      <div className="flex justify-between items-start gap-2 mb-4">
        <button type="button" className="text-sm text-secondary" onClick={onClose}>Close</button>
        <button type="button" className="text-sm text-secondary" onClick={onClose}>Close drawer</button>
      </div>
      <h3 className="text-lg font-semibold">WHAT CHANGED IN CATALOG</h3>
      <p className="text-xs font-mono mt-2">{String(batch.code)}</p>
      <p className="text-sm mt-4 font-semibold">LEFT OUT FROM CATALOG</p>
      <p className="text-xs text-on-surface-variant mt-2">Rows breakdown and changes from this batch.</p>
      <button type="button" className="text-sm text-secondary mt-4" onClick={onDownloadFailed}>Download failed rows</button>
      <button type="button" className="block mt-6 text-sm font-semibold text-error" onClick={onUndo}>
        Undo this import
      </button>
      <button type="button" className="block mt-2 text-sm font-semibold text-error">
        Undo this {name} import?
      </button>
    </aside>
  );
}
