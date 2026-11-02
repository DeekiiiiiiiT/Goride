// Stitch: dominion-redesign/parts_import_ledger_drawer
import { useEffect } from "react";
import { MaterialIcon } from "./MaterialIcon";

export function ImportUndoDialog({
  open,
  areaName,
  fileName,
  fileDateLabel,
  partsCount,
  fitsCount,
  previousBatchCode,
  errorMessage,
  onCancel,
  onConfirm,
  confirming,
}: {
  open: boolean;
  areaName: string;
  fileName?: string;
  fileDateLabel?: string;
  partsCount?: number;
  fitsCount?: number;
  previousBatchCode?: string | null;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirming) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, confirming, onCancel]);

  if (!open) return null;
  const parts = partsCount ?? 0;
  const fits = fitsCount ?? 0;
  const chipLabel = [fileName ?? "import file", fileDateLabel].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="bg-surface-container-lowest rounded-2xl p-6 max-w-md w-full space-y-3 shadow-xl">
        <div className="flex items-start gap-2">
          <MaterialIcon name="warning" className="text-[22px] text-[#b45309] shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold">Undo this {areaName} import?</h3>
            {chipLabel ? (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface-container-low px-3 py-1 text-[11px] font-mono text-on-surface-variant">
                {chipLabel}
              </p>
            ) : null}
          </div>
        </div>
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
        {errorMessage ? (
          <p className="text-sm text-error font-semibold" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" className="px-4 py-2 rounded-lg bg-surface-container-high" onClick={onCancel} disabled={confirming}>
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
              <>
                <MaterialIcon name="delete_sweep" className="text-[18px]" />
                Undo import
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
