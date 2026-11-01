/** FP14 — catalog added notice bar (audit B4). */
export function FpNowOnFileNotice({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div className="mb-space-md flex items-start gap-space-sm rounded-xl border border-primary/20 bg-primary-fixed px-space-md py-space-sm">
      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
      <p className="flex-1 font-body-sm text-body-sm text-on-surface">{message}</p>
      {onDismiss ? (
        <button type="button" className="text-on-surface-variant hover:text-on-surface" onClick={onDismiss} aria-label="Dismiss">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      ) : null}
    </div>
  );
}
