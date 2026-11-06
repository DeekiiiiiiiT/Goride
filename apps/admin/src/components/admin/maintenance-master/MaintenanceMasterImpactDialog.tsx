import { NIGHTLY_COPY, formatInterval } from "./maintenanceMasterFormat";

export type ImpactMode = "confirm" | "draft_preview";

export type ImpactBeforeAfter = {
  before_km: number | null;
  before_months: number | null;
  after_km: number | null;
  after_months: number | null;
};

type Props = {
  open: boolean;
  mode: ImpactMode;
  carCount: number;
  partLabel?: string;
  beforeAfter?: ImpactBeforeAfter | null;
  onClose: () => void;
  onConfirm?: () => void;
  busy?: boolean;
  supportProposal?: boolean;
};

export function MaintenanceMasterImpactDialog({
  open,
  mode,
  carCount,
  partLabel,
  beforeAfter,
  onClose,
  onConfirm,
  busy,
  supportProposal,
}: Props) {
  if (!open) return null;

  const draft = mode === "draft_preview";
  const title = draft
    ? `If you make this active: ${carCount} car${carCount === 1 ? "" : "s"} change`
    : `This changes due dates on ${carCount} Roam Fleet car${carCount === 1 ? "" : "s"}`;

  const beforeText = beforeAfter
    ? formatInterval(beforeAfter.before_km, beforeAfter.before_months)
    : null;
  const afterText = beforeAfter
    ? formatInterval(beforeAfter.after_km, beforeAfter.after_months)
    : null;
  const showIntervalChange =
    beforeAfter &&
    beforeText &&
    afterText &&
    (beforeText !== afterText || !editingHasPrior(beforeAfter));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="mm-light-card w-full max-w-lg rounded-2xl border border-outline-variant/40 bg-white p-6 shadow-lg"
        role="dialog"
        aria-labelledby="mm-impact-title"
      >
        <h2 id="mm-impact-title" className="font-headline text-headline-md text-on-surface">
          {title}
        </h2>
        {partLabel ? (
          <p className="mt-2 text-sm text-on-surface-variant">{partLabel}</p>
        ) : null}
        {!draft ? (
          <p className="mt-4 text-sm text-on-surface-variant">
            Their old reminders for this part are replaced by new ones {NIGHTLY_COPY}.
          </p>
        ) : (
          <p className="mt-4 text-sm text-on-surface-variant">
            Draft schedules do not change cars until you make them active.
          </p>
        )}
        {beforeAfter && (showIntervalChange || afterText) ? (
          <div className="mm-light-card mt-4 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm">
            {beforeText && beforeText !== "—" ? (
              <p className="text-on-surface-variant">{beforeText}</p>
            ) : (
              <p className="text-on-surface-variant">No previous interval</p>
            )}
            <p className="mt-1 font-code text-xs text-on-surface">
              → {afterText}
            </p>
            <p className="mt-2 text-xs text-on-surface-variant">
              {carCount} car{carCount === 1 ? "" : "s"} updated {NIGHTLY_COPY}
            </p>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-outline-variant/60 px-4 py-2 text-sm text-on-surface hover:bg-surface-container"
            onClick={onClose}
            disabled={busy}
          >
            {draft ? "Close" : "Cancel"}
          </button>
          {!draft && onConfirm ? (
            <button
              type="button"
              className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-on-secondary hover:opacity-90 disabled:opacity-50"
              onClick={onConfirm}
              disabled={busy}
            >
              {supportProposal ? "Send to owner for approval" : "Save and update cars"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function editingHasPrior(b: ImpactBeforeAfter): boolean {
  return b.before_km != null || b.before_months != null;
}
