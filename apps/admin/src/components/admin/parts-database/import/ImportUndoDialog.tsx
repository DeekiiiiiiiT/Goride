// Stitch: dominion-redesign/parts_import_ledger_drawer
import { MaterialIcon } from "./MaterialIcon";

export function ImportUndoDialog({
  open,
  areaName,
  partsCount,
  fitsCount,
  previousBatchCode,
  onCancel,
  onConfirm,
  confirming,
}: {
  open: boolean;
  areaName: string;
  partsCount?: number;
  fitsCount?: number;
  previousBatchCode?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  if (!open) return null;
  const parts = partsCount ?? 0;
  const fits = fitsCount ?? 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface-container-lowest rounded-2xl p-6 max-w-md w-full space-y-3 shadow-xl">
        <h3 className="text-lg font-semibold">Undo this {areaName} import?</h3>
        <p className="text-sm text-on-surface-variant">
          {parts} parts and {fits} fits will be removed. Parts used in service logs are kept.
        </p>
        <ul className="text-sm space-y-1 text-on-surface-variant">
          <li className="flex items-center gap-2">
            <MaterialIcon name="check" className="text-[16px] text-[#006e31]" />
            Zero historical logs will be orphaned
          </li>
          {previousBatchCode ? (
            <li className="flex items-center gap-2">
              <MaterialIcon name="check" className="text-[16px] text-[#006e31]" />
              Fitment graph will revert to {previousBatchCode} state
            </li>
          ) : null}
        </ul>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" className="px-4 py-2 rounded-lg bg-surface-container-high" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-error text-on-error font-semibold inline-flex items-center gap-2"
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirming ? (
              <>
                <MaterialIcon name="progress_activity" className="text-[16px] animate-spin" />
                Undoing…
              </>
            ) : (
              "Undo import"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
