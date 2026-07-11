import { Check, Lock, type LucideIcon } from 'lucide-react';
import type { FuelGatedStepState, FuelStepId } from '../../../utils/fuelPeriodGating';

interface FuelPeriodStepperProps {
  states: FuelGatedStepState[];
  activeStepId: FuelStepId;
  onSelect: (id: FuelStepId) => void;
  labels: Record<FuelStepId, string>;
  icons: Record<FuelStepId, LucideIcon>;
}

export function FuelPeriodStepper({
  states,
  activeStepId,
  onSelect,
  labels,
  icons,
}: FuelPeriodStepperProps) {
  return (
    <div className="relative flex w-full items-start justify-between overflow-x-auto pb-1">
      <div className="absolute left-6 right-6 top-[22px] z-0 h-0.5 bg-slate-200" />
      {states.map((step) => {
        const isActive = step.id === activeStepId;
        const Icon = icons[step.id];
        return (
          <button
            key={step.id}
            type="button"
            disabled={step.locked}
            aria-disabled={step.locked}
            aria-current={isActive ? 'step' : undefined}
            onClick={() => {
              if (!step.locked) onSelect(step.id);
            }}
            className={`group relative z-10 flex min-w-[84px] flex-col items-center gap-1.5 px-2 ${
              step.locked ? 'cursor-not-allowed opacity-60' : ''
            }`}
          >
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm sm:h-10 sm:w-10 ${
                step.locked
                  ? 'border-slate-200 bg-slate-50 text-slate-400'
                  : step.complete
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                    : isActive
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-amber-400 bg-amber-50 text-amber-700'
              }`}
            >
              {step.locked ? (
                <Lock className="h-4 w-4" />
              ) : step.complete ? (
                <Check className="h-4 w-4" />
              ) : step.actionable > 0 ? (
                <span className="text-xs font-bold">{step.actionable}</span>
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </span>
            <span
              className={`max-w-[88px] text-center text-[10px] font-medium leading-tight ${
                isActive ? 'text-indigo-700' : 'text-slate-600'
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
