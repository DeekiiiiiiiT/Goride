// Stitch: dominion-redesign/parts_import_ledger_drawer
export function ImportUndoDialog({
  open,
  areaName,
  fileName,
  onCancel,
  onConfirm,
  confirming,
}: {
  open: boolean;
  areaName: string;
  fileName: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface-container-lowest rounded-2xl p-6 max-w-md w-full space-y-3 shadow-xl">
        <h3 className="text-lg font-semibold">Undo this {areaName} import?</h3>
        <p className="text-sm text-on-surface-variant">{fileName}</p>
        <p className="text-xs text-on-surface-variant">Zero historical logs will be orphaned.</p>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" className="px-4 py-2 rounded-lg bg-surface-container-high" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-error text-on-error font-semibold"
            disabled={confirming}
            onClick={onConfirm}
          >
            Undo import
          </button>
        </div>
      </div>
    </div>
  );
}
