/**
 * Fleet Settlement → Cash Settlement tab.
 * Outstanding = Fleet call amount (after driver share) — same SSOT as roamfleet Cash Wallet.
 * Week cards mirror Fleet Cash Wallet: Passenger cash / Cash returned / Paid to driver.
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
import { format } from 'date-fns';
import {
  Eye,
  Wallet,
  Banknote,
  Fuel,
  Receipt,
  Scale,
} from 'lucide-react';
import { cn } from '@roam/ui';
import type { PayoutPeriodRow } from '../../../types/driverPayoutPeriod';
import {
  buildWalletCallOutstandingByMonday,
  type WalletCallOutstanding,
} from '../../../utils/walletCallOutstanding';

type FleetCashSettlementTabProps = {
  periodRows: PayoutPeriodRow[];
};

function plainAmount(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type WeekCardModel = {
  row: PayoutPeriodRow;
  call: WalletCallOutstanding;
  /** Amount the driver still owes the fleet (0 when cleared or fleet owes). */
  outstanding: number;
  paid: number;
  statusLabel: 'Cleared' | 'Cash owed' | 'Cash with you' | 'Fleet owes you';
};

const RECENT_PERIOD_LIMIT = 5;

function buildWeekCards(periodRows: PayoutPeriodRow[]): WeekCardModel[] {
  const byMonday = buildWalletCallOutstandingByMonday(periodRows);
  // Newest first
  const sorted = [...periodRows].sort(
    (a, b) => b.periodStart.getTime() - a.periodStart.getTime(),
  );
  return sorted.map((row) => {
    const weekKey = format(row.periodStart, 'yyyy-MM-dd');
    const call = byMonday[weekKey];
    const paid = call?.breakdown.cashReturned ?? row.cashPaid ?? 0;
    const outstanding =
      call && call.callDirection !== 'fleet_owes' ? call.callAmount : 0;
    let statusLabel: WeekCardModel['statusLabel'] = 'Cleared';
    if (call?.callDirection === 'fleet_owes' && call.callAmount > 0.005) {
      statusLabel = 'Fleet owes you';
    } else if (outstanding < 0.005) {
      statusLabel = 'Cleared';
    } else if (call?.callDirection === 'driver_owes') {
      statusLabel = 'Cash owed';
    } else {
      statusLabel = 'Cash with you';
    }
    return { row, call, outstanding, paid, statusLabel };
  });
}

/** Still open: driver owes / cash with driver, or fleet owes driver. */
function isOpenCashPosition(week: WeekCardModel): boolean {
  if (week.outstanding > 0.005) return true;
  return week.statusLabel === 'Fleet owes you' && week.call.callAmount > 0.005;
}

/**
 * Last N weeks always, plus any older weeks that are not fully settled
 * (driver still owes or fleet owes the driver).
 */
function selectVisibleCashWeeks(all: WeekCardModel[]): {
  recent: WeekCardModel[];
  olderOpen: WeekCardModel[];
} {
  const recent = all.slice(0, RECENT_PERIOD_LIMIT);
  const recentKeys = new Set(recent.map((w) => w.call.weekKey));
  const olderOpen = all.filter(
    (w) => !recentKeys.has(w.call.weekKey) && isOpenCashPosition(w),
  );
  return { recent, olderOpen };
}

function statusBadgeClass(status: WeekCardModel['statusLabel']) {
  return cn(
    status === 'Cleared' &&
      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    status === 'Cash owed' &&
      'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
    status === 'Cash with you' &&
      'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    status === 'Fleet owes you' &&
      'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  );
}

function CashWeekCard({
  week,
  onDetails,
}: {
  week: WeekCardModel;
  onDetails: (week: WeekCardModel) => void;
}) {
  const { passengerCash, cashReturned, settlementPaid } = week.call.breakdown;
  const clearedPct =
    week.outstanding < 0.005
      ? 100
      : Math.max(
          0,
          Math.min(
            100,
            (1 - week.outstanding / Math.max(week.outstanding + week.paid, 0.01)) * 100,
          ),
        );

  return (
    <Card
      className={cn(
        'transition-all hover:shadow-md dark:bg-slate-900/60 dark:border-slate-800',
        (week.outstanding > 0.005 || week.statusLabel === 'Fleet owes you') &&
          'border-amber-200 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-500/5',
      )}
    >
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {format(week.row.periodStart, 'MMM d')} -{' '}
                {format(week.row.periodEnd, 'MMM d, yyyy')}
              </h3>
              <Badge
                variant={week.outstanding < 0.005 ? 'default' : 'secondary'}
                className={statusBadgeClass(week.statusLabel)}
              >
                {week.statusLabel}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {week.row.tripCount} trips
              {week.row.tierName ? ` · ${week.row.tierName}` : ''}
            </p>
          </div>

          <div className="min-w-[110px] space-y-0.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Outstanding
            </p>
            <p
              className={cn(
                'text-xl font-bold tabular-nums',
                week.outstanding > 0.005
                  ? 'text-red-600 dark:text-red-400'
                  : week.statusLabel === 'Fleet owes you'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500',
              )}
            >
              {week.statusLabel === 'Fleet owes you'
                ? `$${plainAmount(week.call.callAmount)}`
                : week.outstanding < 0.005
                  ? '$0.00'
                  : `$${plainAmount(week.outstanding)}`}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {week.call.callLabel}
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

        {/* Same three cash fields as Fleet Cash Wallet week strip */}
        <div className="grid grid-cols-3 gap-3 sm:gap-6">
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Passenger cash
            </p>
            <p className="text-base font-semibold tabular-nums text-slate-800 dark:text-slate-200 sm:text-lg">
              ${plainAmount(passengerCash)}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Cash returned
            </p>
            <p
              className={cn(
                'text-base font-semibold tabular-nums sm:text-lg',
                cashReturned > 0.005
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500',
              )}
            >
              ${plainAmount(cashReturned)}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Paid to driver
            </p>
            <p
              className={cn(
                'text-base font-semibold tabular-nums sm:text-lg',
                settlementPaid > 0.005
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500',
              )}
            >
              ${plainAmount(settlementPaid)}
            </p>
          </div>
        </div>

        {(week.paid > 0.005 || week.outstanding > 0.005 || passengerCash > 0.005) && (
          <div>
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Cash position cleared</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {Math.round(clearedPct)}%
                <span className="font-normal text-slate-400">
                  {' '}
                  · ${plainAmount(week.outstanding)} still owed
                </span>
              </span>
            </div>
            <Progress
              value={clearedPct}
              className="h-2"
              indicatorClassName="bg-gradient-to-r from-emerald-400 to-emerald-600"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FleetCashSettlementTab({ periodRows }: FleetCashSettlementTabProps) {
  const { recent, olderOpen } = useMemo(
    () => selectVisibleCashWeeks(buildWeekCards(periodRows)),
    [periodRows],
  );
  const [selected, setSelected] = useState<WeekCardModel | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        {recent.map((week) => (
          <CashWeekCard key={week.call.weekKey} week={week} onDetails={setSelected} />
        ))}

        {recent.length === 0 && olderOpen.length === 0 && (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400">
            No cash settlement weeks yet.
          </div>
        )}
      </div>

      {olderOpen.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Older open periods
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Weeks outside the last {RECENT_PERIOD_LIMIT} that still need settling — you owe the
              fleet, or the fleet owes you.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {olderOpen.map((week) => (
              <CashWeekCard key={week.call.weekKey} week={week} onDetails={setSelected} />
            ))}
          </div>
        </div>
      )}

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          {selected && (
            <>
              <div className="border-b bg-slate-50/50 px-6 pb-4 pt-6 dark:border-slate-800 dark:bg-slate-900/50">
                <DialogHeader>
                  <div className="mb-1 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
                      <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                    </div>
                    <div>
                      <DialogTitle className="text-base">
                        {format(selected.row.periodStart, 'MMM d')} -{' '}
                        {format(selected.row.periodEnd, 'MMM d, yyyy')}
                      </DialogTitle>
                      <DialogDescription className="mt-0.5 text-xs">
                        Same settlement math as Roam Fleet · {selected.row.tripCount} trips
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div
                    className={cn(
                      'rounded-lg border bg-white p-2.5 text-center dark:bg-slate-950',
                      selected.outstanding > 0.005
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
                        selected.outstanding > 0.005
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      ${plainAmount(selected.outstanding)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-white p-2.5 text-center dark:border-emerald-500/30 dark:bg-slate-950">
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Paid
                    </p>
                    <p className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      ${plainAmount(selected.paid)}
                    </p>
                  </div>
                </div>
              </div>

              <ScrollArea className="flex-1 overflow-auto">
                <div className="space-y-5 px-6 py-5">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Banknote className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            Passenger cash
                          </span>
                        </div>
                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                          ${plainAmount(selected.call.breakdown.passengerCash)}
                        </span>
                      </div>
                      {selected.call.breakdown.personalToll > 0.005 && (
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Receipt className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              Personal toll charged
                            </span>
                          </div>
                          <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                            ${plainAmount(selected.call.breakdown.personalToll)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Banknote className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            Cash returned
                          </span>
                        </div>
                        <span className="font-mono text-sm font-semibold text-emerald-600">
                          ${plainAmount(selected.call.breakdown.cashReturned)}
                        </span>
                      </div>
                      {selected.call.breakdown.fuelCredit > 0.005 && (
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Fuel className="h-3.5 w-3.5 text-teal-500" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              Fuel credit
                            </span>
                          </div>
                          <span className="font-mono text-sm font-semibold text-emerald-600">
                            ${plainAmount(selected.call.breakdown.fuelCredit)}
                          </span>
                        </div>
                      )}
                      {selected.call.breakdown.cashTollCredit > 0.005 && (
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Receipt className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              Cash toll credit
                            </span>
                          </div>
                          <span className="font-mono text-sm font-semibold text-emerald-600">
                            ${plainAmount(selected.call.breakdown.cashTollCredit)}
                          </span>
                        </div>
                      )}
                      {selected.call.breakdown.cashWrittenOff > 0.005 && (
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            Written off
                          </span>
                          <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                            ${plainAmount(selected.call.breakdown.cashWrittenOff)}
                          </span>
                        </div>
                      )}
                      {(selected.call.breakdown.settlementPaid || 0) > 0.005 && (
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            Paid to you
                          </span>
                          <span className="font-mono text-sm font-semibold text-emerald-600">
                            ${plainAmount(selected.call.breakdown.settlementPaid)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Scale className="h-3.5 w-3.5 text-indigo-500" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            Driver share applied
                          </span>
                        </div>
                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                          ${plainAmount(selected.call.breakdown.netPayoutApplied)}
                        </span>
                      </div>
                    </div>
                    <div className="border-t bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                      Outstanding is after fuel, tolls, and your driver share — not the full
                      passenger cash total.
                    </div>
                  </div>

                  <div
                    className={cn(
                      'flex items-center justify-between rounded-lg border-2 p-4',
                      selected.outstanding > 0.005
                        ? 'border-red-200 bg-red-50/50 dark:border-red-500/30 dark:bg-red-500/10'
                        : 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10',
                    )}
                  >
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Outstanding
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{selected.call.callLabel}</p>
                    </div>
                    <p
                      className={cn(
                        'font-mono text-xl font-bold',
                        selected.outstanding > 0.005
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      ${plainAmount(selected.outstanding)}
                    </p>
                  </div>
                </div>
              </ScrollArea>

              <div className="flex items-center justify-between border-t bg-slate-50/50 px-6 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                <Badge className={cn('text-xs', statusBadgeClass(selected.statusLabel))}>
                  {selected.statusLabel}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelected(null)}
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
