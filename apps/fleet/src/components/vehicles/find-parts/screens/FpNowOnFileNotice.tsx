/** FP14 — catalog added notice bar (audit B4). */
export function FpNowOnFileNotice({
  message,
  batchCount,
  onDismiss,
  onSeePart,
  onSeeThem,
}: {
  message: string;
  batchCount?: number;
  onDismiss?: () => void;
  onSeePart?: () => void;
  onSeeThem?: () => void;
}) {
  if (!message && !(batchCount && batchCount > 1)) return null;
  return (
    <div className="mb-space-md flex flex-col gap-space-sm rounded-xl border border-primary/20 bg-primary-fixed px-space-md py-space-sm">
      <div className="flex items-start gap-space-sm">
        <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
        <div className="flex-1 flex flex-col gap-space-xs">
          {message ? <p className="font-body-sm text-body-sm text-on-surface">{message}</p> : null}
          {batchCount && batchCount > 1 ? (
            <p className="font-body-sm text-body-sm text-on-surface">
              {batchCount} parts you asked for are now on file{" "}
              {onSeeThem ? (
                <button type="button" className="font-semibold text-primary hover:underline" onClick={onSeeThem}>
                  See them →
                </button>
              ) : (
                <span className="font-semibold text-primary">See them →</span>
              )}
            </p>
          ) : null}
        </div>
        {onDismiss ? (
          <button type="button" className="text-on-surface-variant hover:text-on-surface" onClick={onDismiss} aria-label="Dismiss">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        ) : null}
      </div>
      {onSeePart ? (
        <button type="button" className="self-start font-body-sm text-body-sm font-semibold text-primary hover:underline" onClick={onSeePart}>
          See the part
        </button>
      ) : null}
    </div>
  );
}
