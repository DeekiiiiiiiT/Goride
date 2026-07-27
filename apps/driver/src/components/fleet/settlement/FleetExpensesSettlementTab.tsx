/**
 * Fleet Settlement → Expenses tab (view-only).
 * Logging stays in the drawer Expenses screen.
 */

import React, { useMemo } from 'react';
import { Card, CardContent } from '@roam/ui';
import { Badge } from '@roam/ui';
import { format } from 'date-fns';
import { Fuel, Receipt, Ticket, Wrench, CircleDot } from 'lucide-react';
import { cn } from '@roam/ui';
import type { FinancialTransaction } from '../../types/data';
import {
  buildFleetExpenseItems,
  groupFleetExpensesByWeek,
  type FleetExpenseType,
} from '../../utils/fleetExpenseItems';

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
  const groups = useMemo(() => {
    const items = buildFleetExpenseItems({ transactions, fuelEntries });
    return groupFleetExpensesByWeek(items);
  }, [transactions, fuelEntries]);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center dark:border-slate-700">
        <Receipt className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
          No expenses for any week yet
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Log fuel, tolls, maintenance, or other costs from the Expenses menu. They will show
          up here by week.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        View only — add or edit expenses from the Expenses menu.
      </p>

      {groups.map((week) => (
        <Card
          key={week.weekKey}
          className="dark:border-slate-800 dark:bg-slate-900/60"
        >
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {format(week.start, 'MMM d')} - {format(week.end, 'MMM d, yyyy')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {week.items.length} expense{week.items.length === 1 ? '' : 's'}
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
              {week.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                      {typeIcon(item.type)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {item.description}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {format(item.date, 'MMM d')} · {typeLabel(item.type)}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'h-5 px-1.5 text-[10px] capitalize',
                            String(item.status).toLowerCase() === 'approved' ||
                              String(item.status).toLowerCase() === 'resolved'
                              ? 'border-emerald-200 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300'
                              : 'border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-400',
                          )}
                        >
                          {item.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                    ${Math.abs(item.amount).toFixed(2)}
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
