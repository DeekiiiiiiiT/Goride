// Stitch: dominion-redesign/categories_retire_dialog_blocked_allowed_states
import { useState } from "react";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

export function RestoreDialog({
  label,
  parentLabel,
  busy,
  onClose,
  onRestore,
}: {
  label: string;
  parentLabel: string | null;
  busy: boolean;
  onClose: () => void;
  onRestore: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const blocked = Boolean(parentLabel);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-surface-dim/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-xl">
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            <span className="font-label text-[10px] font-bold uppercase tracking-widest text-outline">Restore</span>
            <h3 className="font-headline text-base font-semibold text-on-surface">Restore {label}?</h3>
          </div>
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-outline hover:bg-surface-container-low" onClick={onClose}>
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
        <div className="flex flex-col gap-4 p-6">
          {blocked ? (
            <div className="rounded-xl bg-surface-container-low p-4 text-xs text-on-surface">
              Restore '{parentLabel}' first
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="font-headline text-xs font-semibold text-on-surface" htmlFor="restore-reason">Reason *</label>
              <textarea
                id="restore-reason"
                rows={3}
                className="w-full resize-none rounded-xl bg-surface-container-low p-3 text-xs text-on-surface outline-none"
                placeholder="Explain why this is coming back."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <span className="text-[11px] text-outline">Kept in History. At least 10 characters.</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between bg-surface-container-low px-6 py-4">
          <button type="button" className="rounded-lg px-5 py-2.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container" onClick={onClose}>
            {blocked ? "Close" : "Cancel"}
          </button>
          {!blocked && (
            <button
              type="button"
              disabled={busy || reason.trim().length < 10}
              className="rounded-lg bg-secondary px-5 py-2.5 text-xs font-semibold text-on-secondary disabled:opacity-50"
              onClick={() => onRestore(reason.trim())}
            >
              Restore
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
