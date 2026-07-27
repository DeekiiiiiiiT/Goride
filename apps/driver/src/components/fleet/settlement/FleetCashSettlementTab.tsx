/**
 * Fleet Settlement → Cash Settlement tab.
 * Week cards: Outstanding vs Paid only. Details keeps gross cash breakdown.
 */

import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@roam/ui';
import { Badge } from '@roam/ui';
import { Button } from '@roam/ui';
import { Progress } from '@roam/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@roam/ui';
import { ScrollArea } from '@roam/ui';
import { Trip, FinancialTransaction, DriverMetrics } from '../../types/data';
import { format } from 'date-fns';
import {
  DollarSign,
  Info,
  Eye,
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
  Banknote,
  Fuel,
  Receipt,
  CreditCard,
} from 'lucide-react';
import { cn } from '@roam/ui';
import {
  computeWeeklyCashSettlement,
  type CashWeekData,
} from '../../utils/cashSettlementCalc';

type FleetCashSettlementTabProps = {
  trips: Trip[];
  transactions: FinancialTransaction[];
  csvMetrics: DriverMetrics[];
};

function statusBadgeClass(status: CashWeekData['status'], amountOwed: number) {
  return cn(
    status === 'Paid' &&
      'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    status === 'Partial' &&
      'bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    status === 'Unpaid' &&
      amountOwed > 0 &&
      'bg-red-100 text-red-700 hover:bg-red-200 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
    status === 'Overpaid' &&
      'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
    status === 'No Activity' &&
      'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  );
}

export function FleetCashSettlementTab({
  trips = [],
  transactions = [],
  csvMetrics = [],
}: FleetCashSettlementTabProps) {
  const weeks = useMemo(
    () => computeWeeklyCashSettlement({ trips, transactions, csvMetrics }),
    [trips, transactions, csvMetrics],
  );

  const [selectedWeek, setSelectedWeek] = useState<CashWeekData | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        {weeks.map((week, idx) => {
          const denom = week.amountPaid + Math.max(0, week.balance);
          const progressPct =
            week.status !== 'No Activity' && denom > 0.01
              ? Math.min(100, Math.round((week.amountPaid / denom) * 100))
              : null;

          return (
            <Card
              key={idx}
              className={cn(
                'transition-all hover:shadow-md dark:bg-slate-900/60 dark:border-slate-800',
                week.status === 'Unpaid' &&
                  week.amountOwed > 0 &&
                  'border-amber-200 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-500/5',
              )}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900 dark:text-white">
                        {format(week.start, 'MMM d')} - {format(week.end, 'MMM d, yyyy')}
                      </h3>
                      <Badge
                        variant={
                          week.status === 'Paid'
                            ? 'default'
                            : week.status === 'Partial'
                              ? 'secondary'
                              : week.status === 'Overpaid' || week.status === 'No Activity'
                                ? 'outline'
                                : 'destructive'
                        }
                        className={statusBadgeClass(week.status, week.amountOwed)}
                      >
                        {week.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {week.isFromCsv ? (
                        <span className="flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          Reported via Import ({week.tripCount} trips linked)
                        </span>
                      ) : (
                        <span>
                          {week.cashTripCount} cash trips • {week.tripCount} total trips
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:gap-10">
                    <div className="space-y-0.5 min-w-[100px]">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Outstanding
                      </p>
                      <p
                        className={cn(
                          'text-xl font-bold tabular-nums',
                          week.balance > 0.01
                            ? 'text-red-600 dark:text-red-400'
                            : week.balance < -0.01
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400 dark:text-slate-500',
                        )}
                      >
                        ${Math.abs(week.balance).toFixed(2)}
                      </p>
                    </div>
                    <div className="space-y-0.5 min-w-[80px]">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Paid
                      </p>
                      <p
                        className={cn(
                          'text-xl font-bold tabular-nums',
                          week.amountPaid > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400 dark:text-slate-500',
                        )}
                      >
                        ${week.amountPaid.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs border-slate-300 hover:bg-slate-100 hover:border-blue-300 hover:text-blue-700 dark:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-blue-300"
                      onClick={() => setSelectedWeek(week)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Details
                    </Button>
                  </div>
                </div>

                {progressPct != null && week.status !== 'No Activity' && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Paid toward week</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {progressPct}%
                      </span>
                    </div>
                    <Progress
                      value={progressPct}
                      className="h-2"
                      indicatorClassName={
                        week.status === 'Paid' || week.status === 'Overpaid'
                          ? 'bg-emerald-500'
                          : 'bg-gradient-to-r from-orange-400 to-amber-600'
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {weeks.length === 0 && (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400">
            No cash settlement activity yet.
          </div>
        )}
      </div>

      <Dialog
        open={!!selectedWeek}
        onOpenChange={(open) => {
          if (!open) setSelectedWeek(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          {selectedWeek && (
            <>
              <div className="border-b bg-slate-50/50 px-6 pb-4 pt-6 dark:border-slate-800 dark:bg-slate-900/50">
                <DialogHeader>
                  <div className="mb-1 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
                      <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                    </div>
                    <div>
                      <DialogTitle className="text-base">
                        {format(selectedWeek.start, 'MMM d')} -{' '}
                        {format(selectedWeek.end, 'MMM d, yyyy')}
                      </DialogTitle>
                      <DialogDescription className="mt-0.5 text-xs">
                        Cash settlement breakdown · {selectedWeek.cashTripCount} cash trips ·{' '}
                        {selectedWeek.tripCount} total trips
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div
                    className={cn(
                      'rounded-lg border bg-white p-2.5 text-center dark:bg-slate-950',
                      selectedWeek.balance > 0
                        ? 'border-red-100 dark:border-red-500/30'
                        : 'border-emerald-100 dark:border-emerald-500/30',
                    )}
                  >
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Outstanding
                    </p>
                    <p
                      className={cn(
                        'font-mono text-sm font-bold',
                        selectedWeek.balance > 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      ${Math.abs(selectedWeek.balance).toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-white p-2.5 text-center dark:border-emerald-500/30 dark:bg-slate-950">
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Paid
                    </p>
                    <p className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      ${selectedWeek.amountPaid.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              <ScrollArea className="flex-1 overflow-auto">
                <div className="space-y-5 px-6 py-5">
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-red-100 dark:bg-red-500/20">
                        <ArrowUpCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Why you owe (cash collected)
                      </h4>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Banknote className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              Cash Collected
                            </span>
                            {selectedWeek.isFromCsv && (
                              <Badge
                                variant="outline"
                                className="text-[9px] border-blue-200 text-blue-600"
                              >
                                CSV Import
                              </Badge>
                            )}
                          </div>
                          <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                            ${selectedWeek.breakdown.cashCollected.toFixed(2)}
                          </span>
                        </div>
                        {selectedWeek.breakdown.floatIssued > 0 && (
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                Float Issued
                              </span>
                            </div>
                            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                              ${selectedWeek.breakdown.floatIssued.toFixed(2)}
                            </span>
                          </div>
                        )}
                        {selectedWeek.breakdown.tollCharges > 0 && (
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Receipt className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                Personal Toll Charges
                              </span>
                            </div>
                            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                              ${selectedWeek.breakdown.tollCharges.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Total cash for period
                        </span>
                        <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                          ${selectedWeek.amountOwed.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 dark:bg-emerald-500/20">
                        <ArrowDownCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        What counts as paid
                      </h4>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedWeek.breakdown.allocatedPayments > 0 && (
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                Allocated Payments
                              </span>
                            </div>
                            <span className="font-mono text-sm font-semibold text-emerald-600">
                              ${selectedWeek.breakdown.allocatedPayments.toFixed(2)}
                            </span>
                          </div>
                        )}
                        {selectedWeek.breakdown.fifoPayments > 0 && (
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <DollarSign className="h-3.5 w-3.5 text-blue-500" />
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                FIFO Pool Payments
                              </span>
                            </div>
                            <span className="font-mono text-sm font-semibold text-emerald-600">
                              ${selectedWeek.breakdown.fifoPayments.toFixed(2)}
                            </span>
                          </div>
                        )}
                        {selectedWeek.breakdown.surplusPayments > 0 && (
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <DollarSign className="h-3.5 w-3.5 text-purple-500" />
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                Surplus Distribution
                              </span>
                            </div>
                            <span className="font-mono text-sm font-semibold text-emerald-600">
                              ${selectedWeek.breakdown.surplusPayments.toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Receipt className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              Approved Toll Expenses
                            </span>
                          </div>
                          <span
                            className={cn(
                              'font-mono text-sm font-semibold',
                              selectedWeek.breakdown.tollExpenses > 0
                                ? 'text-emerald-600'
                                : 'text-slate-400',
                            )}
                          >
                            ${selectedWeek.breakdown.tollExpenses.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Fuel className="h-3.5 w-3.5 text-teal-500" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              Fuel Reimbursement Credits
                            </span>
                          </div>
                          <span
                            className={cn(
                              'font-mono text-sm font-semibold',
                              selectedWeek.breakdown.fuelCredits > 0
                                ? 'text-emerald-600'
                                : 'text-slate-400',
                            )}
                          >
                            ${selectedWeek.breakdown.fuelCredits.toFixed(2)}
                          </span>
                        </div>
                        {selectedWeek.amountPaid === 0 &&
                          selectedWeek.breakdown.tollExpenses === 0 &&
                          selectedWeek.breakdown.fuelCredits === 0 && (
                            <div className="px-4 py-3 text-center text-sm text-slate-400">
                              No payments or credits applied to this period
                            </div>
                          )}
                      </div>
                      <div className="flex items-center justify-between border-t bg-emerald-50/50 px-4 py-2.5 dark:border-slate-700 dark:bg-emerald-500/5">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Total Paid
                        </span>
                        <span className="font-mono text-sm font-bold text-emerald-600">
                          ${selectedWeek.amountPaid.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'flex items-center justify-between rounded-lg border-2 p-4',
                      selectedWeek.balance > 0.01
                        ? 'border-red-200 bg-red-50/50 dark:border-red-500/30 dark:bg-red-500/10'
                        : selectedWeek.balance < -0.01
                          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                          : 'border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/50',
                    )}
                  >
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Outstanding
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {selectedWeek.balance > 0.01
                          ? 'Still to hand to the fleet'
                          : selectedWeek.balance < -0.01
                            ? 'Overpaid for this week'
                            : 'Fully settled'}
                      </p>
                    </div>
                    <p
                      className={cn(
                        'font-mono text-xl font-bold',
                        selectedWeek.balance > 0.01
                          ? 'text-red-600 dark:text-red-400'
                          : selectedWeek.balance < -0.01
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-600 dark:text-slate-300',
                      )}
                    >
                      ${Math.abs(selectedWeek.balance).toFixed(2)}
                    </p>
                  </div>
                </div>
              </ScrollArea>

              <div className="flex items-center justify-between border-t bg-slate-50/50 px-6 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                <Badge
                  variant={
                    selectedWeek.status === 'Paid'
                      ? 'default'
                      : selectedWeek.status === 'Partial'
                        ? 'secondary'
                        : selectedWeek.status === 'Overpaid'
                          ? 'outline'
                          : 'destructive'
                  }
                  className={cn('text-xs', statusBadgeClass(selectedWeek.status, selectedWeek.amountOwed))}
                >
                  Status: {selectedWeek.status}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedWeek(null)}
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
