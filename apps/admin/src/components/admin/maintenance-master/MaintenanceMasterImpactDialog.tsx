import { NIGHTLY_COPY, formatInterval } from "./maintenanceMasterFormat";

/**
 * Before-saving box for a schedule. Dominion only describes its own data: the schedule
 * before → after and when apps pick it up. It never counts Roam Fleet cars.
 */
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
  partLabel,
  beforeAfter,
  onClose,
  onConfirm,
  busy,
  supportProposal,
}: Props) {
  if (!open) return null;

  const draft = mode === "draft_preview";
  const title = draft ? "This schedule is a draft" : supportProposal ? "Send this change for approval?" : "Save this schedule?";
  const beforeText = beforeAfter ? formatInterval(beforeAfter.before_km, beforeAfter.before_months) : null;
  const afterText = beforeAfter ? formatInterval(beforeAfter.after_km, beforeAfter.after_months) : null;

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
        {partLabel ? <p className="mt-2 text-sm text-on-surface-variant">{partLabel}</p> : null}
        <p className="mt-4 text-sm text-on-surface-variant">
          {draft
            ? "Drafts are not sent to any app until you make them active."
            : supportProposal
              ? "The owner approves it in the Review list before any app gets it."
              : `Every app picks up the new schedule ${NIGHTLY_COPY}.`}
        </p>
        {beforeAfter && afterText ? (
          <div className="mt-4 rounded-lg border border-outline-variant/30 bg-[#f4f3fa] px-3 py-2 text-sm">
            <p className="text-on-surface-variant">
              {beforeText && beforeText !== "—" ? beforeText : "No previous schedule"}
            </p>
            <p className="mt-1 font-code text-xs text-on-surface">→ {afterText}</p>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-error/60 bg-white px-4 py-2 text-sm font-medium text-error hover:bg-error/10"
            onClick={onClose}
            disabled={busy}
          >
            {draft ? "Close" : "Cancel"}
          </button>
          {!draft && onConfirm ? (
            <button
              type="button"
              className="rounded-lg bg-[#0153dc] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              onClick={onConfirm}
              disabled={busy}
            >
              {supportProposal ? "Send to owner for approval" : "Save schedule"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
