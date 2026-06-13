import React from 'react';
import { cn } from '@roam/ui';
import type { DriverEarningsPeriod } from '@roam/types/rides';

export type HomePeriod = Extract<DriverEarningsPeriod, 'today' | 'week'>;

type Props = {
  period: HomePeriod;
  onPeriodChange: (period: HomePeriod) => void;
  className?: string;
};

export function DriverHomePeriodToggle({ period, onPeriodChange, className }: Props) {
  return (
    <div className={cn('mb-3 flex flex-col items-center', className)}>
      <div className="flex w-full max-w-[15rem] rounded-full bg-slate-200/80 p-1 dark:bg-white/10">
        {(['today', 'week'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPeriodChange(p)}
            className={cn(
              'flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors',
              period === p
                ? 'bg-[#006d43] text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {p === 'today' ? 'Today' : 'Work week'}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-400 dark:text-slate-500">
        {period === 'week' ? 'Mon 4:00 AM – Mon 4:00 AM (Jamaica)' : 'Today (Jamaica)'}
      </p>
    </div>
  );
}
