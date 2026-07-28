/**
 * Fleet Settlement → Expenses tab (view-only).
 * Cards show week total only; Details shows Fuel / Toll / Maintenance / Misc.
 * Weeks match Cash Settlement (last 5 financial periods).
 */

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent } from '@roam/ui';
import { Button } from '@roam/ui';
import { format } from 'date-fns';
import { Eye, Fuel, Receipt, Ticket, Wrench, Package, X } from 'lucide-react';
import { cn } from '@roam/ui';
import type { FinancialTransaction } from '../../../types/data';
import type { PayoutPeriodRow } from '../../../types/driverPayoutPeriod';
import {
  buildFleetExpenseItems,
  selectExpenseWeeksForPeriods,
  type FleetExpenseType,
  type FleetExpenseWeekGroup,
} from '../../../utils/fleetExpenseItems';

const RECENT_WEEK_LIMIT = 5;

type FleetExpensesSettlementTabProps = {
  periodRows: PayoutPeriodRow[];
  transactions: FinancialTransaction[];
  fuelEntries: any[];
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

function ExpenseWeekCard({
  week,
  onDetails,
}: {
  week: FleetExpenseWeekGroup;
  onDetails: (week: FleetExpenseWeekGroup) => void;
}) {
  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900/60">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              {format(week.start, 'MMM d')} - {format(week.end, 'MMM d, yyyy')}
            </h3>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Total
            </p>
            <p
              className={cn(
                'text-lg font-bold tabular-nums',
                week.total > 0.005
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-400 dark:text-slate-500',
              )}
            >
              ${plainAmount(week.total)}
            </p>
          </div>
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
      </CardContent>
    </Card>
  );
}

export function FleetExpensesSettlementTab({
  periodRows,
  transactions,
  fuelEntries,
}: FleetExpensesSettlementTabProps) {
  const weeks = useMemo(() => {
    const items = buildFleetExpenseItems({ transactions, fuelEntries });
    return selectExpenseWeeksForPeriods(items, periodRows, RECENT_WEEK_LIMIT);
  }, [periodRows, transactions, fuelEntries]);
  const [selected, setSelected] = useState<FleetExpenseWeekGroup | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        View only — add or edit from the menu.
      </p>

      <div className="grid grid-cols-1 gap-4">
        {weeks.map((week) => (
          <ExpenseWeekCard key={week.weekKey} week={week} onDetails={setSelected} />
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
              aria-labelledby="expense-week-details-title"
              className="relative z-[101] flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl"
            >
              <div className="shrink-0 border-b border-slate-200 px-5 pb-4 pt-5 dark:border-slate-700">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      id="expense-week-details-title"
                      className="text-base font-semibold text-slate-900 dark:text-white"
                    >
                      {format(selected.start, 'MMM d')} -{' '}
                      {format(selected.end, 'MMM d, yyyy')}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Week total ${plainAmount(selected.total)}
                    </p>
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
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {/* Card-style category rollup (Fuel / Toll / Maintenance / Misc) */}
                <ul className="mb-5 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                  {selected.categories.map((cat) => (
                    <li
                      key={cat.type}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                          {typeIcon(cat.type)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {typeLabel(cat.type)}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {cat.count} item{cat.count === 1 ? '' : 's'}
                          </p>
                        </div>
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

                <div className="space-y-4">
                  {selected.categories.map((cat) => {
                    const catItems = selected.items.filter((i) => i.type === cat.type);
                    if (catItems.length === 0) return null;
                    return (
                      <div key={`lines-${cat.type}`}>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {typeLabel(cat.type)} line items
                        </p>
                        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                          {catItems.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-start justify-between gap-3 px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm text-slate-800 dark:text-slate-100">
                                  {item.description}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {format(item.date, 'MMM d')} · {item.status}
                                </p>
                              </div>
                              <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                                ${plainAmount(Math.abs(item.amount))}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                  {selected.items.length === 0 && (
                    <div className="flex flex-col items-center py-6 text-center">
                      <Receipt className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        No expenses logged this week
                      </p>
                    </div>
                  )}
                </div>
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
