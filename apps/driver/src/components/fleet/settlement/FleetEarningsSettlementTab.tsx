/**
 * Fleet Settlement → Earnings tab (view-only).
 * Cards: Earned / Deductions / Net. Details: Fuel / Toll / Maintenance / Misc.
 */

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent } from '@roam/ui';
import { Button } from '@roam/ui';
import { format } from 'date-fns';
import { Eye, Fuel, Ticket, Wrench, Package, X } from 'lucide-react';
import { cn } from '@roam/ui';
import type { FinancialTransaction } from '../../../types/data';
import type { DriverFinancialPeriodClient } from '../../../types/driverPayoutPeriod';
import {
  buildEarningsWeeksFromPeriods,
  type FleetExpenseType,
  type FleetExpenseWeekGroup,
} from '../../../utils/fleetExpenseItems';

const RECENT_WEEK_LIMIT = 5;

type FleetEarningsSettlementTabProps = {
  periods: DriverFinancialPeriodClient[];
  transactions: FinancialTransaction[];
};

function plainAmount(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function typeIcon(type: FleetExpenseType) {
  switch (type) {
    case 'fuel':
      return <Fuel className="h-4 w-4 text-teal-500" />;
    case 'toll':
      return <Ticket className="h-4 w-4 text-purple-500" />;
    case 'maintenance':
      return <Wrench className="h-4 w-4 text-blue-500" />;
    case 'misc':
      return <Package className="h-4 w-4 text-amber-500" />;
  }
}

function typeLabel(type: FleetExpenseType) {
  switch (type) {
    case 'fuel':
      return 'Fuel';
    case 'toll':
      return 'Toll';
    case 'maintenance':
      return 'Maintenance';
    case 'misc':
      return 'Misc';
  }
}

function EarningsWeekCard({
  week,
  onDetails,
}: {
  week: FleetExpenseWeekGroup;
  onDetails: (week: FleetExpenseWeekGroup) => void;
}) {
  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900/60">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-slate-900 dark:text-white">
            {format(week.start, 'MMM d')} - {format(week.end, 'MMM d, yyyy')}
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 text-xs border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            onClick={() => onDetails(week)}
          >
            <Eye className="h-3.5 w-3.5" />
            Details
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Earned
            </p>
            <p
              className={cn(
                'text-base font-semibold tabular-nums sm:text-lg',
                week.earned > 0.005
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-400 dark:text-slate-500',
              )}
            >
              ${plainAmount(week.earned)}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Deductions
            </p>
            <p
              className={cn(
                'text-base font-semibold tabular-nums sm:text-lg',
                week.deductionsTotal > 0.005
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-400 dark:text-slate-500',
              )}
            >
              ${plainAmount(week.deductionsTotal)}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Net
            </p>
            <p
              className={cn(
                'text-base font-bold tabular-nums sm:text-lg',
                week.net >= 0.005
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : week.net < -0.005
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-400 dark:text-slate-500',
              )}
            >
              ${plainAmount(week.net)}
            </p>
          </div>
        </div>
        {week.tipsWithheld > 0.005 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Tips held by fleet (quota missed): ${plainAmount(week.tipsWithheld)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function FleetEarningsSettlementTab({
  periods,
  transactions,
}: FleetEarningsSettlementTabProps) {
  const weeks = useMemo(
    () =>
      buildEarningsWeeksFromPeriods({
        periods,
        transactions,
        limit: RECENT_WEEK_LIMIT,
      }),
    [periods, transactions],
  );
  const [selected, setSelected] = useState<FleetExpenseWeekGroup | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        {weeks.map((week) => (
          <EarningsWeekCard key={week.weekKey} week={week} onDetails={setSelected} />
        ))}
      </div>

      {selected &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center safe-x p-4 sm:items-center"
            role="presentation"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/50 touch-manipulation"
              aria-label="Close"
              onClick={() => setSelected(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="earnings-week-details-title"
              className="relative z-[101] flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl"
            >
              <div className="shrink-0 border-b border-slate-200 px-5 pb-4 pt-5 dark:border-slate-700">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2
                      id="earnings-week-details-title"
                      className="text-base font-semibold text-slate-900 dark:text-white"
                    >
                      {format(selected.start, 'MMM d')} -{' '}
                      {format(selected.end, 'MMM d, yyyy')}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    aria-label="Close details"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-center dark:border-slate-700 dark:bg-slate-950">
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Earned
                    </p>
                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                      ${plainAmount(selected.earned)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-white p-2.5 text-center dark:border-emerald-500/30 dark:bg-slate-950">
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Net
                    </p>
                    <p
                      className={cn(
                        'font-mono text-sm font-bold',
                        selected.net >= 0.005
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : selected.net < -0.005
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-400',
                      )}
                    >
                      ${plainAmount(selected.net)}
                    </p>
                  </div>
                </div>
                {selected.tipsWithheld > 0.005 ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    Tips held by fleet (quota missed): ${plainAmount(selected.tipsWithheld)}
                  </p>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                  {selected.categories.map((cat) => (
                    <li
                      key={cat.type}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                          {typeIcon(cat.type)}
                        </div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {typeLabel(cat.type)}
                        </p>
                      </div>
                      <p
                        className={cn(
                          'shrink-0 font-mono text-sm font-semibold tabular-nums',
                          cat.total > 0.005
                            ? 'text-slate-900 dark:text-white'
                            : 'text-slate-400 dark:text-slate-500',
                        )}
                      >
                        ${plainAmount(cat.total)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex shrink-0 items-center justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-700">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelected(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
