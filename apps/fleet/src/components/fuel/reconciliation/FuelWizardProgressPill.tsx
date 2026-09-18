/**
 * Stitch B: vertical “Reconciliation Steps” card (mobile).
 * Stitch C: compact Step N of 6 bar (desktop sub-header).
 */
import { Check, Lock } from 'lucide-react';
import type { FuelGatedStepState, FuelStepId } from '../../../utils/fuelPeriodGating';
import { FUEL_STEP_ORDER } from '../../../utils/fuelPeriodGating';

const DISPLAY_LABELS: Record<FuelStepId, string> = {
  'data-quality': 'Data Quality',
  'adjustments-disputes': 'Disputes',
  'policy-check': 'Policy Check',
  'leakage-gap': 'Review Flagged Vehicles',
  'settlement-preview': 'Settle-up',
  finalize: 'Finalize & Post',
};

const SHORT_LABELS: Record<FuelStepId, string> = {
  'data-quality': 'Check data',
  'adjustments-disputes': 'Disputes',
  'policy-check': 'Policies',
  'leakage-gap': 'Review issues',
  'settlement-preview': 'Settle-up',
  finalize: 'Lock week',
};

export function FuelWizardProgressPill({
  activeStepId,
  states,
  variant = 'bar',
}: {
  activeStepId: FuelStepId;
  states: FuelGatedStepState[];
  /** bar = Stitch C compact; timeline = Stitch B vertical card */
  variant?: 'bar' | 'timeline';
}) {
  const idx = Math.max(0, FUEL_STEP_ORDER.indexOf(activeStepId));
  const total = FUEL_STEP_ORDER.length;
  const activeComplete = Boolean(states.find((s) => s.id === activeStepId)?.complete);
  const pct = Math.round(((idx + (activeComplete ? 1 : 0)) / total) * 100);
  const label = SHORT_LABELS[activeStepId] || activeStepId;

  if (variant === 'timeline') {
    return (
      <section
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        aria-label={`Step ${idx + 1} of ${total}: ${DISPLAY_LABELS[activeStepId]}`}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
            Reconciliation Steps
          </h2>
          <span className="text-xs font-medium text-[#3525cd]">
            Step {idx + 1} of {total}
          </span>
        </div>
        <div className="space-y-2.5">
          {FUEL_STEP_ORDER.map((id, i) => {
            const state = states.find((s) => s.id === id);
            const done = Boolean(state?.complete) || i < idx;
            const current = id === activeStepId;
            const locked = Boolean(state?.locked) && !current && !done;
            const name = DISPLAY_LABELS[id];

            if (current) {
              return (
                <div
                  key={id}
                  className="-mx-2 flex items-center gap-3 rounded-lg border border-[#d4c8f5] bg-slate-50 p-2"
                >
                  <div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3525cd] text-[10px] font-bold text-white shadow-sm">
                    <span className="absolute h-2 w-2 animate-ping rounded-full bg-white/70" />
                    <span className="relative">{i + 1}</span>
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{name}</span>
                    <span className="rounded-full bg-[#3525cd] px-2 py-0.5 text-[10px] font-semibold text-white">
                      Current step
                    </span>
                  </div>
                </div>
              );
            }

            if (done) {
              return (
                <div key={id} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-50 text-emerald-700">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <span className="text-sm text-slate-500 line-through opacity-80">
                      Step {i + 1}: {name}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700">Done</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={id} className={`flex items-center gap-3 ${locked ? 'opacity-60' : 'opacity-70'}`}>
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                  {locked ? (
                    <Lock className="h-3 w-3" aria-hidden />
                  ) : (
                    <span className="text-[10px] font-semibold">{i + 1}</span>
                  )}
                </div>
                <span className="text-sm text-slate-500">
                  Step {i + 1}: {name}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
      aria-label={`Step ${idx + 1} of ${total}: ${label}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#3525cd]">
            Step {idx + 1} of {total}
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-[15px] font-semibold text-slate-900">{label}</span>
        </div>
        <div className="h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-slate-200 sm:w-56">
          <div
            className="h-full rounded-full bg-[#3525cd] transition-[width]"
            style={{ width: `${Math.min(100, Math.max(8, pct))}%` }}
          />
        </div>
        <span className="text-xs font-medium text-slate-500">{pct}% complete</span>
      </div>
      <div className="hidden flex-wrap items-center gap-3 text-xs text-slate-500 lg:flex">
        {FUEL_STEP_ORDER.map((id, i) => {
          const done = i < idx || Boolean(states.find((s) => s.id === id)?.complete);
          const current = id === activeStepId;
          const short = SHORT_LABELS[id];
          if (current) {
            return (
              <span
                key={id}
                className="border-b-2 border-[#3525cd] pb-0.5 font-bold text-[#3525cd]"
              >
                {i + 1}: {short}
              </span>
            );
          }
          if (done) {
            return (
              <span key={id} className="inline-flex items-center gap-1 font-medium text-emerald-700">
                <Check className="h-3.5 w-3.5" aria-hidden />
                {i + 1}: {short}
              </span>
            );
          }
          return (
            <span key={id} className="text-slate-400">
              {i + 1}: {short}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export { DISPLAY_LABELS as FUEL_STEP_DISPLAY_LABELS, SHORT_LABELS as FUEL_STEP_SHORT_LABELS };
