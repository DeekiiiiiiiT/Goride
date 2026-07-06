import React from 'react';
import { Check, type LucideIcon } from 'lucide-react';

export type ReconciliationStepStatus = 'clear' | 'attention';

export interface ReconciliationStepDef {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Open-item count for this step. 0 renders as "clear" (emerald check). */
  count: number;
  /** Set on a step whose dependency isn't satisfied yet (e.g. Dispute
   *  Refunds before any claim exists) — shown as a subtle note, never a
   *  disabled/blocked state (soft-guide, not hard-gate: every step stays
   *  clickable regardless). */
  hint?: string;
}

interface ReconciliationStepperProps {
  steps: ReconciliationStepDef[];
  activeStepId: string;
  onSelect: (id: string) => void;
}

/**
 * Guided, ordered navigation for Toll Reconciliation — replaces the flat,
 * equally-weighted tab bar with a sequence that signals "what to do next"
 * via count badges, while keeping every step clickable (soft-guide, not a
 * hard-gated wizard: periods legitimately have zero items in a bucket, and
 * Dispute Refunds arrive from Uber on their own schedule, not the fleet
 * manager's pacing).
 *
 * Structurally modeled on apps/dash-courier's DeliveryStepper (connecting
 * line + circular step nodes + label), rebuilt in this app's own visual
 * language (lucide-react + slate/amber/emerald, not Material-3 tokens) with
 * count badges — the one thing neither dash-courier stepper has, since
 * courier steps are fixed route legs, not variable item counts. No
 * progress-fill line (unlike the courier version): these steps aren't a
 * strict sequence a driver physically walks, so a "% complete" line would
 * imply an ordering enforcement this component deliberately doesn't have.
 */
export function ReconciliationStepper({ steps, activeStepId, onSelect }: ReconciliationStepperProps) {
  return (
    <div className="flex items-start justify-between relative w-full overflow-x-auto pb-1">
      <div className="absolute left-6 right-6 top-[22px] h-0.5 bg-slate-200 z-0" />
      {steps.map((step) => {
        const isActive = step.id === activeStepId;
        const isClear = step.count === 0;
        const Icon = step.icon;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelect(step.id)}
            className="flex flex-col items-center gap-1.5 relative z-10 px-2 min-w-[84px] group"
          >
            <div
              className={`relative w-11 h-11 rounded-full flex items-center justify-center border-2 transition-colors bg-white ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 shadow-md'
                  : isClear
                    ? 'border-emerald-400 text-emerald-500 group-hover:border-emerald-500'
                    : 'border-amber-400 text-amber-600 group-hover:border-amber-500'
              }`}
            >
              {isClear ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              {!isClear && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {step.count > 99 ? '99+' : step.count}
                </span>
              )}
            </div>
            <span className={`text-[11px] font-medium text-center leading-tight ${isActive ? 'text-indigo-700' : 'text-slate-600'}`}>
              {step.label}
            </span>
            {step.hint && (
              <span className="text-[9px] text-slate-400 text-center leading-tight max-w-[90px]">{step.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Default landing step: first step with open items, else the last (History-adjacent) step. */
export function pickDefaultStep(steps: ReconciliationStepDef[]): string {
  const firstOpen = steps.find((s) => s.count > 0);
  return (firstOpen || steps[steps.length - 1])?.id ?? steps[0]?.id;
}
