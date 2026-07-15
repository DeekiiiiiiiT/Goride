/**
 * Cash detail overlay — plain add/subtract from passenger cash → cash still owed.
 */
import React, { useMemo } from 'react';
import { format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/sheet';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { Calendar, Phone } from 'lucide-react';
import type { CashWeekData } from '../../utils/cashSettlementCalc';
import type { FinancialTransaction } from '../../types/data';
import {
  cashPaymentWeekKey,
  isCashReturnedForWeek,
  isDriverCashPaymentTransaction,
} from '../../utils/driverCashPayment';
import type { WalletCallOutstanding } from '../../utils/walletCallOutstanding';
import { cn } from '../ui/utils';

interface CashWalletWeekDetailProps {
  week: CashWeekData | null;
  transactions: FinancialTransaction[];
  callOutstanding?: WalletCallOutstanding;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmt = (n: number) =>
  Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Row({
  label,
  hint,
  amount,
  sign,
  bold,
  tone,
}: {
  label: string;
  hint?: string;
  amount: number;
  sign?: 'plus' | 'minus' | 'none';
  bold?: boolean;
  tone?: 'muted' | 'owed' | 'credit' | 'total';
}) {
  const prefix = sign === 'minus' ? '−' : sign === 'plus' ? '+' : '';
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className={cn('text-sm', bold ? 'font-semibold text-slate-900' : 'text-slate-600')}>
          {sign === 'minus' || sign === 'plus' ? (
            <span className="text-slate-400 mr-1">{prefix}</span>
          ) : null}
          {label}
        </p>
        {hint ? <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p> : null}
      </div>
      <span
        className={cn(
          'text-sm tabular-nums shrink-0',
          bold && 'font-bold',
          tone === 'owed' && 'text-rose-700 font-bold',
          tone === 'credit' && 'text-emerald-700 font-semibold',
          tone === 'total' && 'text-slate-900 font-bold',
          tone === 'muted' && 'text-slate-600',
          !tone && 'text-slate-800 font-medium',
        )}
      >
        {prefix && amount > 0.0005 ? prefix : ''}
        {fmt(amount)}
      </span>
    </div>
  );
}

export function CashWalletWeekDetail({
  week,
  transactions,
  callOutstanding,
  open,
  onOpenChange,
}: CashWalletWeekDetailProps) {
  const payments = useMemo(() => {
    if (!week) return [];
    const monday = format(week.start, 'yyyy-MM-dd');
    return (transactions || [])
      .filter((t) => isCashReturnedForWeek(t, monday))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [week, transactions]);

  const pendingTagged = useMemo(() => {
    if (!week) return [];
    const monday = format(week.start, 'yyyy-MM-dd');
    return (transactions || []).filter((t) => {
      if (!isDriverCashPaymentTransaction(t)) return false;
      if (cashPaymentWeekKey(t) !== monday) return false;
      const st = String(t.status || '').toLowerCase();
      return st === 'pending';
    });
  }, [week, transactions]);

  if (!week) return null;

  const periodLabel = `${format(week.start, 'MMM d')} – ${format(week.end, 'MMM d, yyyy')}`;
  const br = week.breakdown;
  const b = callOutstanding?.breakdown;
  const cashOwed =
    callOutstanding && callOutstanding.callDirection !== 'fleet_owes'
      ? callOutstanding.callAmount
      : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Cash detail</SheetTitle>
          <SheetDescription className="text-xs">{periodLabel}</SheetDescription>
        </SheetHeader>

        {callOutstanding && (
          <div
            className={cn(
              'rounded-lg px-4 py-3 mt-2 border',
              callOutstanding.callDirection === 'fleet_owes' && 'bg-emerald-50 border-emerald-100',
              callOutstanding.callDirection === 'driver_owes' && 'bg-rose-50 border-rose-100',
              callOutstanding.callDirection === 'cash_with_driver' && 'bg-amber-50 border-amber-100',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
                <Phone className="h-3.5 w-3.5" />
                Cash still owed
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  'font-normal',
                  cashOwed < 0.005 && callOutstanding.callDirection !== 'fleet_owes' && 'bg-emerald-100 text-emerald-700',
                  callOutstanding.callDirection === 'driver_owes' && cashOwed > 0.005 && 'bg-rose-100 text-rose-700',
                  callOutstanding.callDirection === 'cash_with_driver' && 'bg-amber-100 text-amber-800',
                  callOutstanding.callDirection === 'fleet_owes' && 'bg-emerald-100 text-emerald-700',
                )}
              >
                {callOutstanding.callDirection === 'fleet_owes'
                  ? 'Fleet owes driver'
                  : callOutstanding.callDirection === 'driver_owes'
                    ? 'Fleet cash cut'
                    : cashOwed < 0.005
                      ? 'Cleared'
                      : 'With driver'}
              </Badge>
            </div>
            <p className="text-2xl font-bold mt-1 tabular-nums text-slate-900">
              {callOutstanding.callDirection === 'fleet_owes'
                ? fmt(callOutstanding.callAmount)
                : cashOwed < 0.005
                  ? '—'
                  : fmt(cashOwed)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Add and subtract the lines below — same math as Financials → Settlement.
            </p>
          </div>
        )}

        {b && (
          <div className="mt-5 rounded-lg border border-slate-100 px-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 pt-3 pb-1">
              Why this cash is owed
            </p>

            <Row
              label="Passenger cash"
              hint={
                br && (br.uberCash > 0.005 || br.nonUberTripCash > 0.005)
                  ? [
                      br.uberCash > 0.005 ? `Uber ${fmt(br.uberCash)}` : null,
                      br.nonUberTripCash > 0.005 ? `InDrive/Roam ${fmt(br.nonUberTripCash)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Cash taken on trips'
              }
              amount={b.passengerCash}
            />

            {b.personalToll > 0.005 && (
              <Row
                label="Personal toll charged"
                hint="Tag tolls billed to the driver"
                amount={b.personalToll}
                sign="plus"
              />
            )}

            <Row
              label="Cash returned"
              hint="Log Cash tagged to this week"
              amount={b.cashReturned}
              sign="minus"
              tone="credit"
            />

            <Row
              label="Fleet fuel credit"
              hint="Company fuel share (Fuel Reconciliation)"
              amount={b.fuelCredit}
              sign="minus"
              tone="credit"
            />

            <Row
              label="Cash toll credit"
              hint="Cash plaza tolls (Toll Reconciliation)"
              amount={b.cashTollCredit}
              sign="minus"
              tone="credit"
            />

            <Separator />

            <Row
              label="Cash still held"
              hint="Cash left with driver after returns and expense credits"
              amount={b.stillHeld}
              bold
              tone="total"
            />

            {callOutstanding?.finalized ? (
              <Row
                label="Net payout"
                hint="Driver share after fuel deduction — applied against cash held"
                amount={b.netPayoutApplied}
                sign="minus"
                tone="credit"
              />
            ) : (
              <div className="py-2">
                <p className="text-sm text-slate-600">Net payout</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Pending — earnings not finalized yet. Cash still owed = cash still held for now.
                </p>
              </div>
            )}

            <Separator />

            <Row
              label={
                callOutstanding?.callDirection === 'fleet_owes'
                  ? 'Fleet owes driver'
                  : 'Cash still owed'
              }
              hint={
                callOutstanding?.finalized
                  ? 'Cash still held − net payout'
                  : 'Equals cash still held until payout is finalized'
              }
              amount={
                callOutstanding?.callDirection === 'fleet_owes'
                  ? callOutstanding.callAmount
                  : cashOwed
              }
              bold
              tone="owed"
            />
          </div>
        )}

        <div className="mt-6">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Cash Returned lines
            </p>
          </div>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-500 py-3">
              No Log Cash payments tagged to this week.
            </p>
          ) : (
            <div className="space-y-2">
              {payments.map((tx) => {
                const d = tx.date ? new Date(tx.date) : null;
                return (
                  <div
                    key={tx.id}
                    className="rounded-md border border-slate-100 px-3 py-2.5 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {tx.description || 'Cash payment'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Receipt {d && !Number.isNaN(d.getTime()) ? format(d, 'MMM d, yyyy') : '—'}
                        {tx.paymentMethod ? ` · ${tx.paymentMethod}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 tabular-nums shrink-0">
                      +{fmt(tx.amount || 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {(br?.surplusPayments || 0) > 0.005 && (
            <p className="text-[11px] text-amber-700 mt-3 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
              {fmt(br.surplusPayments)} untagged cash dated in this week — tag Settlement Week on Payments Log so it counts as Cash Returned.
            </p>
          )}
          {pendingTagged.length > 0 && (
            <p className="text-[11px] text-blue-700 mt-2 bg-blue-50 border border-blue-100 rounded-md px-2 py-1.5">
              {pendingTagged.length} pending transfer
              {pendingTagged.length !== 1 ? 's' : ''} tagged here — under Unverified until verified.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
