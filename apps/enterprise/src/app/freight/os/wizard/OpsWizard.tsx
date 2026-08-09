import { ReactNode } from 'react';

type Props = {
  steps: string[];
  stepIndex: number;
  children: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  /** Final-step primary action (replaces Continue). */
  confirmSlot?: ReactNode;
  error?: string | null;
};

/** Minimal step chrome for book / assign wizards. */
export function OpsWizard({
  steps,
  stepIndex,
  children,
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled,
  confirmSlot,
  error,
}: Props) {
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= steps.length - 1;

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
        {steps.map((label, i) => {
          const active = i === stepIndex;
          const done = i < stepIndex;
          return (
            <li key={label} className="flex items-center gap-1.5">
              {i > 0 ? <span className="text-slate-300" aria-hidden>·</span> : null}
              <span
                className={
                  active
                    ? 'font-semibold text-amber-900'
                    : done
                      ? 'text-slate-600'
                      : 'text-slate-400'
                }
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">{children}</div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={isFirst}
          onClick={onBack}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Back
        </button>
        {isLast ? (
          confirmSlot
        ) : (
          <button
            type="button"
            disabled={continueDisabled}
            onClick={onContinue}
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
          >
            {continueLabel}
          </button>
        )}
      </div>
    </div>
  );
}
