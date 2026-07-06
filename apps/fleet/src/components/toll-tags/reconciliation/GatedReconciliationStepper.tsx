import { Check, Lock, type LucideIcon } from 'lucide-react';
import type { StepId, StepCounts } from '../../../utils/tollPeriodGating';

export interface GatedStepState {
  id: StepId;
  /** True when an earlier step still has actionable items — cannot be entered. */
  locked: boolean;
  /** True when THIS step's own actionable count is 0 — the "Next" gate has opened. */
  complete: boolean;
  /** The single step the wizard should be showing right now (first non-locked, non-complete). */
  isCurrent: boolean;
  actionable: number;
  informational: number;
}

/**
 * The hard-gate state machine (Phase F4). Recomputed fresh from live counts on
 * every render — there is no stored "progress" — so if an earlier step's
 * actionable count rises again after the user has moved forward (e.g. a
 * background rematch re-flags an old toll), later steps immediately re-lock.
 * Informational counts never affect locking/completion — only actionable does.
 */
export function computeGatedStepStates(
  counts: Record<StepId, StepCounts>,
  order: StepId[],
): GatedStepState[] {
  const states: GatedStepState[] = [];
  let earlierHasActionable = false;
  for (const id of order) {
    const { actionable, informational } = counts[id];
    const complete = actionable === 0;
    const locked = earlierHasActionable;
    states.push({ id, locked, complete, isCurrent: false, actionable, informational });
    if (!complete) earlierHasActionable = true;
  }
  const currentIdx = states.findIndex((s) => !s.locked && !s.complete);
  if (currentIdx >= 0) states[currentIdx].isCurrent = true;
  return states;
}

/** Default landing step: resume at the first step still needing attention, else the last step. */
export function pickInitialStep(states: GatedStepState[]): StepId {
  const current = states.find((s) => s.isCurrent);
  if (current) return current.id;
  return (states[states.length - 1] ?? states[0]).id;
}

interface GatedReconciliationStepperProps {
  states: GatedStepState[];
  activeStepId: StepId;
  onSelect: (id: StepId) => void;
  labels: Record<StepId, string>;
  icons: Record<StepId, LucideIcon>;
}

/**
 * Hard-gated sibling of ReconciliationStepper (soft-guide, kept unchanged —
 * every step there stays clickable). Here, a locked step cannot be entered:
 * the fleet manager is forced through needs-review → personal-use →
 * deadhead → underpaid-claims → dispute-refunds → unlinked-refunds in order,
 * one period at a time.
 */
export function GatedReconciliationStepper({ states, activeStepId, onSelect, labels, icons }: GatedReconciliationStepperProps) {
  return (
    <div className="flex items-start justify-between relative w-full overflow-x-auto pb-1">
      <div className="absolute left-6 right-6 top-[22px] h-0.5 bg-slate-200 z-0" />
      {states.map((step) => {
        const isActive = step.id === activeStepId;
        const Icon = icons[step.id];
        return (
          <button
            key={step.id}
            type="button"
            disabled={step.locked}
            aria-disabled={step.locked}
            onClick={() => { if (!step.locked) onSelect(step.id); }}
            className={`flex flex-col items-center gap-1.5 relative z-10 px-2 min-w-[84px] group ${
              step.locked ? 'cursor-not-allowed opacity-60' : ''
            }`}
          >
            <div
              className={`relative w-11 h-11 rounded-full flex items-center justify-center border-2 transition-colors bg-white ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 shadow-md'
                  : step.complete
                    ? 'border-emerald-400 text-emerald-500 group-hover:border-emerald-500'
                    : step.locked
                      ? 'border-slate-300 text-slate-400'
                      : 'border-amber-400 text-amber-600 group-hover:border-amber-500'
              }`}
            >
              {step.locked ? (
                <Lock className="h-4 w-4" />
              ) : step.complete ? (
                <Check className="h-5 w-5" />
              ) : (
                <Icon className="h-5 w-5" />
              )}
              {!step.complete && !step.locked && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {step.actionable > 99 ? '99+' : step.actionable}
                </span>
              )}
              {step.informational > 0 && (
                <span className="absolute -bottom-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-slate-400 text-white text-[9px] font-bold flex items-center justify-center">
                  {step.informational > 99 ? '99+' : step.informational}
                </span>
              )}
            </div>
            <span
              className={`text-[11px] font-medium text-center leading-tight ${
                isActive ? 'text-indigo-700' : step.locked ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              {labels[step.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
