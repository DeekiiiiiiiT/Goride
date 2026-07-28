/**
 * Fleet Settlement → Expenses tab (view-only).
 * Category totals per week — not a receipt dump. Logging stays in Expenses menu.
 */

import React, { useMemo } from 'react';
import { Card, CardContent } from '@roam/ui';
import { format } from 'date-fns';
import { Fuel, Receipt, Ticket, Wrench, CircleDot } from 'lucide-react';
import type { FinancialTransaction } from '../../../types/data';
import {
  buildFleetExpenseItems,
  groupFleetExpensesByWeek,
  selectRecentExpenseWeeks,
  type FleetExpenseType,
} from '../../../utils/fleetExpenseItems';

const RECENT_WEEK_LIMIT = 5;

type FleetExpensesSettlementTabProps = {
  transactions: FinancialTransaction[];
  fuelEntries: any[];
};

function typeIcon(type: FleetExpenseType) {
  switch (type) {
    case 'fuel':
      return <Fuel className="h-4 w-4 text-teal-500" />;
    case 'toll':
      return <Ticket className="h-4 w-4 text-purple-500" />;
    case 'maintenance':
      return <Wrench className="h-4 w-4 text-blue-500" />;
    default:
      return <CircleDot className="h-4 w-4 text-slate-400" />;
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
    default:
      return 'Other';
  }
}

export function FleetExpensesSettlementTab({
  transactions,
  fuelEntries,
}: FleetExpensesSettlementTabProps) {
  const weeks = useMemo(() => {
    const items = buildFleetExpenseItems({ transactions, fuelEntries });
    return selectRecentExpenseWeeks(groupFleetExpensesByWeek(items), RECENT_WEEK_LIMIT);
  }, [transactions, fuelEntries]);

  if (weeks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center dark:border-slate-700">
        <Receipt className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
          No expenses for any week yet
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Log fuel, tolls, maintenance, or other costs from the Expenses menu. They will show
          up here by week as category totals.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        View only — last {RECENT_WEEK_LIMIT} weeks, totaled by Fuel / Toll / Maintenance / Other.
        Add or edit from the Expenses menu.
      </p>

      {weeks.map((week) => (
        <Card key={week.weekKey} className="dark:border-slate-800 dark:bg-slate-900/60">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {format(week.start, 'MMM d')} - {format(week.end, 'MMM d, yyyy')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {week.categories.length} categor
                  {week.categories.length === 1 ? 'y' : 'ies'} charged
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Total
                </p>
                <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                  ${week.total.toFixed(2)}
                </p>
              </div>
            </div>

            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {week.categories.map((cat) => (
                <li
                  key={cat.type}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
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
                  <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                    ${cat.total.toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
