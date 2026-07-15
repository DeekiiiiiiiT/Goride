// Cash Wallet week detail — collection desk only (no bank / settlement).
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
import { Banknote, Wallet, Calendar } from 'lucide-react';
import type { CashWeekData } from '../../utils/cashSettlementCalc';
import type { FinancialTransaction } from '../../types/data';
import {
  cashPaymentWeekKey,
  isCashReturnedForWeek,
  isDriverCashPaymentTransaction,
} from '../../utils/driverCashPayment';
import { cn } from '../ui/utils';

interface CashWalletWeekDetailProps {
  week: CashWeekData | null;
  transactions: FinancialTransaction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CashWalletWeekDetail({
  week,
  transactions,
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
  const gap = week.balance;
  const br = week.breakdown;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Cash Collection Detail</SheetTitle>
          <SheetDescription className="text-xs">{periodLabel}</SheetDescription>
        </SheetHeader>

        <div
          className={cn(
            'rounded-lg px-4 py-3 mt-2',
            gap > 0.005 ? 'bg-amber-50' : 'bg-emerald-50',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {gap > 0.005 ? 'Collection gap remaining' : 'Cash fully collected'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {week.cashTripCount} cash trips · {week.tripCount} total trips
              </p>
            </div>
            <Badge
              variant="secondary"
              className={cn(
                'font-normal',
                week.status === 'Paid' && 'bg-emerald-100 text-emerald-700',
                week.status === 'Partial' && 'bg-amber-100 text-amber-700',
                week.status === 'Unpaid' && 'bg-red-100 text-red-700',
              )}
            >
              {week.status}
            </Badge>
          </div>
          <p
            className={cn(
              'text-2xl font-bold mt-2 tabular-nums',
              gap > 0.005 ? 'text-rose-600' : 'text-emerald-600',
            )}
          >
            {fmt(gap)}
          </p>
        </div>

        <div className="mt-5 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Collection
          </p>
          <div className="flex items-start justify-between py-2">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-slate-400" />
              <div>
                <p className="text-sm text-slate-600">Passenger cash</p>
                <p className="text-[11px] text-slate-400">Uber statement + InDrive/Roam cash</p>
              </div>
            </div>
            <span className="text-sm font-medium tabular-nums">{fmt(week.amountOwed)}</span>
          </div>
          {(br?.uberCash > 0.005 || br?.nonUberTripCash > 0.005) && (
            <div className="pl-6 pb-1 space-y-1 text-[11px] text-slate-500">
              {br.uberCash > 0.005 && (
                <div className="flex justify-between gap-2">
                  <span>Uber cash</span>
                  <span className="tabular-nums">{fmt(br.uberCash)}</span>
                </div>
              )}
              {br.nonUberTripCash > 0.005 && (
                <div className="flex justify-between gap-2">
                  <span>InDrive / Roam cash</span>
                  <span className="tabular-nums">{fmt(br.nonUberTripCash)}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-start justify-between py-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-slate-900">− Cash Returned</p>
                <p className="text-[11px] text-slate-400">
                  Log Cash rows tagged to this Settlement Week
                </p>
              </div>
            </div>
            <span className="text-sm font-bold text-emerald-700 tabular-nums">
              −{fmt(week.amountPaid)}
            </span>
          </div>
          <Separator />
          <div className="flex items-start justify-between py-2">
            <p className="text-sm font-semibold text-slate-900">Collection gap</p>
            <span
              className={cn(
                'text-sm font-bold tabular-nums',
                gap > 0.005 ? 'text-rose-600' : 'text-emerald-600',
              )}
            >
              {fmt(gap)}
            </span>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Cash Returned lines
            </p>
          </div>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-500 py-3">
              No Log Cash payments tagged to this Settlement Week.
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
              {fmt(br.surplusPayments)} untagged cash dated in this week — open Payments Log → Edit →
              pick Settlement Week so it counts as Cash Returned.
            </p>
          )}
          {pendingTagged.length > 0 && (
            <p className="text-[11px] text-blue-700 mt-2 bg-blue-50 border border-blue-100 rounded-md px-2 py-1.5">
              {pendingTagged.length} pending transfer
              {pendingTagged.length !== 1 ? 's' : ''} tagged here — shown under Unverified until
              verified (not in Cash Returned yet).
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
