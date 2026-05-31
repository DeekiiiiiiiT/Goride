import React from 'react';
import { cn } from '@roam/ui';
import type { DriverEarningsPeriod } from '@roam/types/rides';

export type HomePeriod = Extract<DriverEarningsPeriod, 'today' | 'week'>;

type Props = {
  period: HomePeriod;
  onPeriodChange: (period: HomePeriod) => void;
};

export function DriverHomePeriodToggle({ period, onPeriodChange }: Props) {
  return (
    <div className="mb-6 flex flex-col items-center">
      <div className="flex w-64 rounded-full bg-slate-200/80 p-1 dark:bg-slate-800/80">
        {(['today', 'week'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPeriodChange(p)}
            className={cn(
              'flex-1 rounded-full py-2 text-sm font-medium transition-colors',
              period === p
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {p === 'today' ? 'Today' : 'Work week'}
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
        {period === 'week' ? 'Mon 4:00 AM – Mon 4:00 AM (Jamaica)' : 'Today (Jamaica)'}
      </p>
    </div>
  );
}
