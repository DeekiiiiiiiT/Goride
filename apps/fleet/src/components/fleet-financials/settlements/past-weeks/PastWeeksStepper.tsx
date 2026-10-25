import { Check } from 'lucide-react';
import { PAST_WEEK_STEP_TITLES } from '../../../../utils/pastWeeksCleanupCopy';
import { cn } from '../../../ui/utils';

const STEPS = [1, 2, 3, 4] as const;

export function PastWeeksStepper({
  step,
  progress,
  onSelect,
}: {
  step: 1 | 2 | 3 | 4;
  /** First step that still needs a decision. Later steps stay locked. */
  progress: 1 | 2 | 3 | 4 | 5;
  onSelect: (step: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" aria-label="Clean-up steps">
      {STEPS.map((id) => {
        const locked = id > progress;
        const done = id < progress;
        const active = id === step;
        return (
          <button
            key={id}
            type="button"
            disabled={locked}
            aria-current={active ? 'step' : undefined}
            onClick={() => onSelect(id)}
            className={cn(
              'flex h-11 min-w-[7.5rem] flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium',
              locked && 'cursor-not-allowed bg-slate-50 text-slate-400',
              done && !active && 'bg-emerald-50 text-emerald-800',
              active && 'bg-[#3525cd] text-white',
              !locked && !active && !done && 'bg-amber-50 text-amber-950',
            )}
          >
            {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span>{id}</span>}
            <span className="truncate">{PAST_WEEK_STEP_TITLES[id]}</span>
          </button>
        );
      })}
    </div>
  );
}
