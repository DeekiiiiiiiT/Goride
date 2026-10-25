import { PAST_WEEKS_CLOSE } from '@roam/finance-core';
import { Button } from '../../../ui/button';
import { weekLabel } from '../../../../utils/pastWeeksCleanupCopy';
import { cn } from '../../../ui/utils';

export function CloseWeeksStep({
  openWeeks,
  onCloseNext,
}: {
  openWeeks: string[];
  onCloseNext: (weekKey: string) => void;
}) {
  const next = openWeeks[0];
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        These 5 weeks must be closed in order before corrections can post.
      </p>
      <ul className="space-y-2">
        {PAST_WEEKS_CLOSE.map((week) => {
          const open = openWeeks.includes(week);
          return (
            <li key={week} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-900">Week of {weekLabel(week)}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  open ? 'bg-amber-100 text-amber-950' : 'bg-emerald-100 text-emerald-800',
                )}
              >
                {open ? 'Open' : 'Closed'}
              </span>
            </li>
          );
        })}
      </ul>
      {next ? (
        <Button type="button" className="h-11" onClick={() => onCloseNext(next)}>
          Close next week ({weekLabel(next)})
        </Button>
      ) : (
        <p className="text-sm text-slate-600">These weeks are closed.</p>
      )}
    </div>
  );
}
