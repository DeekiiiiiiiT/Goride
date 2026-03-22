// ════════════════════════════════════════════════════════════════════════════
// Payout Period Detail — Sheet overlay showing full breakdown for one period
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { cn } from '../ui/utils';
import {
  CheckCircle,
  Clock,
  Wallet,
  Receipt,
  Fuel,
  Car,
  DollarSign,
  Banknote,
  TrendingDown,
  Award,
  Percent,
  Scale,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

import type { CashPaidBreakdown, PayoutPeriodRow, PayoutStatus } from '../../types/driverPayoutPeriod';
import { getPeriodSettlementComponents } from '../../utils/driverSettlementMath';

export type { PayoutPeriodRow };

interface PayoutPeriodDetailProps {
  row: PayoutPeriodRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function sumCashPaidParts(b: CashPaidBreakdown): number {
  return (
    b.allocatedPayments +
    b.tollCredits +
    b.fuelCreditsInCashPaid +
    b.fifoPayments +
    b.surplusPayments
  );
}

const statusConfig: Record<PayoutStatus, { icon: React.ReactNode; color: string; bg: string; label: string; description: string }> = {
  Finalized: {
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    label: 'Finalized',
    description: 'Expenses confirmed and all cash returned',
  },
  'Awaiting Cash': {
    icon: <Wallet className="h-4 w-4" />,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    label: 'Awaiting Cash',
    description: 'Expenses confirmed, but driver still has unreturned cash',
  },
  Pending: {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    label: 'Pending',
    description: 'Fuel report not yet finalized — deductions can\'t be fully computed',
  },
};

function LineItem({
  icon,
  label,
  value,
  valueColor,
  bold,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
  sub?: string;
}) {
  return (
    <div className="flex items-start justify-between py-2">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
        <div className="min-w-0">
          <p className={`text-sm ${bold ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
            {label}
          </p>
          {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </div>
      <span
        className={`text-sm tabular-nums whitespace-nowrap ml-4 ${bold ? 'font-bold' : 'font-medium'} ${valueColor || 'text-slate-900'}`}
      >
        {value}
      </span>
    </div>
  );
}

type SectionVariant = 'emerald' | 'rose' | 'sky' | 'indigo';

const sectionShell: Record<SectionVariant, string> = {
  emerald:
    'border-emerald-200/90 bg-emerald-50/70 dark:bg-emerald-950/25 dark:border-emerald-800/60',
  rose: 'border-rose-200/90 bg-rose-50/60 dark:bg-rose-950/25 dark:border-rose-800/60',
  sky: 'border-sky-200/90 bg-sky-50/70 dark:bg-sky-950/25 dark:border-sky-800/60',
  indigo:
    'border-indigo-200/90 bg-indigo-50/70 dark:bg-indigo-950/25 dark:border-indigo-800/60',
};

function PayoutSection({
  title,
  description,
  variant,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  description?: string;
  variant: SectionVariant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className={cn('rounded-xl border shadow-sm overflow-hidden', sectionShell[variant])}>
        <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {title}
            </h3>
            {description && (
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 pr-1">{description}</p>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-slate-500 mt-0.5 transition-transform duration-200',
              open ? 'rotate-0' : '-rotate-90'
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 border-t border-slate-900/5 dark:border-white/10">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function PayoutPeriodDetail({ row, open, onOpenChange }: PayoutPeriodDetailProps) {
  const [secRevenue, setSecRevenue] = useState(true);
  const [secDeductions, setSecDeductions] = useState(true);
  const [secCash, setSecCash] = useState(true);
  const [secSettlement, setSecSettlement] = useState(true);
  const [cashPaidBreakdownOpen, setCashPaidBreakdownOpen] = useState(false);

  useEffect(() => {
    if (!open) setCashPaidBreakdownOpen(false);
  }, [open]);

  if (!row) return null;

  const periodLabel = `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;
  const cfg = statusConfig[row.status];

  const hasCashActivity =
    row.cashOwed > 0.005 || row.cashPaid > 0.005 || row.cashBalance > 0.005;

  const b = row.cashPaidBreakdown;
  const breakdownSum = b ? sumCashPaidParts(b) : 0;
  const breakdownMatches = b && Math.abs(breakdownSum - row.cashPaid) < 0.5;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Payout Detail</SheetTitle>
          <SheetDescription className="text-xs">{periodLabel}</SheetDescription>
        </SheetHeader>

        <div className={`mx-4 rounded-lg px-4 py-3 flex items-center gap-3 ${cfg.bg}`}>
          <span className={cfg.color}>{cfg.icon}</span>
          <div>
            <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{cfg.description}</p>
          </div>
        </div>

        <div className="px-4 pt-4 pb-6 space-y-4">
          {/* Revenue & Tier */}
          <PayoutSection
            title="Revenue & Tier"
            description="Gross earnings and commission split"
            variant="emerald"
            open={secRevenue}
            onOpenChange={setSecRevenue}
          >
            <LineItem
              icon={<Car className="h-4 w-4" />}
              label="Gross Revenue"
              value={fmt(row.grossRevenue)}
              valueColor="text-emerald-700"
              sub={`${row.tripCount} trip${row.tripCount !== 1 ? 's' : ''} this period`}
            />
            <LineItem
              icon={<Award className="h-4 w-4" />}
              label="Tier"
              value={row.tierName}
              valueColor="text-slate-700"
            />
            <LineItem
              icon={<Percent className="h-4 w-4" />}
              label="Driver Share %"
              value={`${row.driverSharePercent}%`}
              valueColor="text-slate-700"
            />
            <LineItem
              icon={<DollarSign className="h-4 w-4" />}
              label="Driver Share"
              value={fmt(row.driverShare)}
              valueColor="text-emerald-700"
              bold
              sub="Gross Revenue × Driver Share %"
            />
          </PayoutSection>

          {/* Deductions + Net Payout */}
          <PayoutSection
            title="Deductions"
            description="Tolls and fuel subtracted from Driver Share"
            variant="rose"
            open={secDeductions}
            onOpenChange={setSecDeductions}
          >
            <LineItem
              icon={<Receipt className="h-4 w-4" />}
              label="Toll Expenses"
              value={row.tollExpenses > 0.005 ? `−${fmt(row.tollExpenses)}` : '$0.00'}
              valueColor={row.tollExpenses > 0.005 ? 'text-rose-600' : 'text-slate-400'}
              sub={
                row.tollReconciled + row.tollUnreconciled > 0
                  ? row.tollUnreconciled === 0
                    ? `${row.tollReconciled}/${row.tollReconciled} matched to trips`
                    : `${row.tollReconciled}/${row.tollReconciled + row.tollUnreconciled} matched · ${row.tollUnreconciled} unmatched`
                  : undefined
              }
            />
            <LineItem
              icon={<Fuel className="h-4 w-4" />}
              label="Fuel Deduction"
              value={
                row.isFinalized
                  ? row.fuelDeduction > 0.005
                    ? `−${fmt(row.fuelDeduction)}`
                    : '$0.00'
                  : 'Pending'
              }
              valueColor={
                !row.isFinalized
                  ? 'text-amber-600'
                  : row.fuelDeduction > 0.005
                    ? 'text-rose-600'
                    : 'text-slate-400'
              }
              sub={!row.isFinalized ? 'Awaiting fuel report finalization' : undefined}
            />
            <LineItem
              icon={<TrendingDown className="h-4 w-4" />}
              label="Total Deductions"
              value={
                row.isFinalized
                  ? row.totalDeductions > 0.005
                    ? `−${fmt(row.totalDeductions)}`
                    : '$0.00'
                  : 'Pending'
              }
              valueColor={
                !row.isFinalized ? 'text-amber-600' : row.totalDeductions > 0.005 ? 'text-rose-600' : 'text-slate-400'
              }
              bold
            />

            <div
              className={`rounded-lg px-3 py-3 mt-2 ${
                row.isFinalized ? 'bg-white/70 dark:bg-slate-900/40' : 'bg-amber-50/80 dark:bg-amber-950/30'
              } border border-white/60 dark:border-slate-700/60`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Net Payout</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {row.isFinalized
                      ? 'Driver Share minus all deductions'
                      : 'Will be computed once fuel report is finalized'}
                  </p>
                </div>
                <p
                  className={`text-xl font-bold tabular-nums ${
                    row.isFinalized
                      ? row.netPayout >= 0
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                      : 'text-amber-600'
                  }`}
                >
                  {row.isFinalized ? fmt(row.netPayout) : 'Pending'}
                </p>
              </div>
            </div>
          </PayoutSection>

          {/* Cash Position */}
          {hasCashActivity && (
            <PayoutSection
              title="Cash Position"
              description="Cash collected vs. returned for this period"
              variant="sky"
              open={secCash}
              onOpenChange={setSecCash}
            >
              <LineItem
                icon={<Banknote className="h-4 w-4" />}
                label="Cash Owed"
                value={row.cashOwed > 0.005 ? fmt(row.cashOwed) : '$0.00'}
                valueColor={row.cashOwed > 0.005 ? 'text-slate-700' : 'text-slate-400'}
                sub="Cash collected from passengers"
              />
              {row.cashPaid > 0.005 ? (
                <button
                  type="button"
                  onClick={() => setCashPaidBreakdownOpen(true)}
                  className="flex w-full items-start justify-between gap-3 rounded-lg py-2 px-1 -mx-1 text-left transition-colors hover:bg-sky-100/60 dark:hover:bg-sky-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Wallet className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                        Cash Paid
                        <ChevronRight className="h-3.5 w-3.5 text-sky-600 shrink-0" aria-hidden />
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Direct cash returns to company — tap for breakdown
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-medium tabular-nums whitespace-nowrap ml-4 text-emerald-700">
                    {fmt(row.cashPaid)}
                  </span>
                </button>
              ) : (
                <LineItem
                  icon={<Wallet className="h-4 w-4" />}
                  label="Cash Paid"
                  value="$0.00"
                  valueColor="text-slate-400"
                  sub="Direct cash returns to company"
                />
              )}

              <div className="pt-1 mt-1 border-t border-slate-900/5 dark:border-white/10">
                <LineItem
                  label="Cash Balance"
                  value={fmt(row.cashBalance)}
                  valueColor={row.cashBalance > 0.005 ? 'text-rose-700' : 'text-emerald-700'}
                  bold
                  sub={row.cashBalance > 0.005 ? 'Driver still holding this cash' : 'All cash returned'}
                />
              </div>
            </PayoutSection>
          )}

          {/* Settlement */}
          {hasCashActivity &&
            (() => {
              const { settlement, adjCashBalance } = getPeriodSettlementComponents(row);
              const driverOwes = settlement > 0.005;
              const companyOwes = settlement < -0.005;
              const isSettled = !driverOwes && !companyOwes;

              return (
                <PayoutSection
                  title="Settlement"
                  description="Adj. cash balance minus Net Payout — amount owed"
                  variant="indigo"
                  open={secSettlement}
                  onOpenChange={setSecSettlement}
                >
                  <LineItem
                    icon={<Banknote className="h-4 w-4" />}
                    label="Adj. Cash Balance"
                    value={fmt(adjCashBalance)}
                    valueColor="text-slate-700"
                    sub={
                      row.fuelCredits > 0
                        ? `Original ${fmt(row.cashBalance)} minus ${fmt(row.fuelCredits)} fuel credit`
                        : 'Cash balance for this period'
                    }
                  />
                  <LineItem
                    icon={<DollarSign className="h-4 w-4" />}
                    label="Net Payout"
                    value={row.isFinalized ? `−${fmt(row.netPayout)}` : 'Pending'}
                    valueColor={row.isFinalized ? 'text-emerald-600' : 'text-amber-600'}
                    sub="Subtracted because the company owes the driver this amount"
                  />

                  <div
                    className={`rounded-lg px-3 py-3 mt-2 border ${
                      !row.isFinalized
                        ? 'bg-amber-50/90 border-amber-200/80 dark:bg-amber-950/40'
                        : driverOwes
                          ? 'bg-rose-50/90 border-rose-200/80 dark:bg-rose-950/40'
                          : companyOwes
                            ? 'bg-blue-50/90 border-blue-200/80 dark:bg-blue-950/40'
                            : 'bg-emerald-50/90 border-emerald-200/80 dark:bg-emerald-950/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Scale
                          className={`h-5 w-5 shrink-0 ${
                            !row.isFinalized
                              ? 'text-amber-600'
                              : driverOwes
                                ? 'text-rose-600'
                                : companyOwes
                                  ? 'text-blue-600'
                                  : 'text-emerald-600'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Settlement</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {!row.isFinalized
                              ? 'Partial — net payout not yet finalized'
                              : driverOwes
                                ? 'Driver owes the fleet'
                                : companyOwes
                                  ? 'Company owes the driver'
                                  : 'Fully settled — no balance remaining'}
                          </p>
                        </div>
                      </div>
                      <p
                        className={`text-xl font-bold tabular-nums shrink-0 ${
                          !row.isFinalized
                            ? 'text-amber-600'
                            : driverOwes
                              ? 'text-rose-700'
                              : companyOwes
                                ? 'text-blue-700'
                                : 'text-emerald-700'
                        }`}
                      >
                        {isSettled && row.isFinalized ? '$0.00' : fmt(settlement)}
                      </p>
                    </div>
                  </div>
                </PayoutSection>
              );
            })()}
        </div>
      </SheetContent>
    </Sheet>

    <Dialog open={cashPaidBreakdownOpen} onOpenChange={setCashPaidBreakdownOpen}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Cash paid breakdown</DialogTitle>
          <DialogDescription className="text-xs">
            {periodLabel} — everything that counts toward &quot;Cash Paid&quot; (reduces cash owed).
          </DialogDescription>
        </DialogHeader>

        {!row.cashPaidBreakdown ? (
          <p className="text-sm text-slate-500 py-2">
            A detailed breakdown isn&apos;t available for this period. Open{' '}
            <strong>Cash Wallet</strong> on the driver profile for the weekly settlement detail.
          </p>
        ) : (
          <div className="space-y-1 pt-2">
            {[
              {
                label: 'Allocated payments',
                sub: 'Cash collections / payments tagged to this work period',
                value: row.cashPaidBreakdown.allocatedPayments,
              },
              {
                label: 'Cash toll credits',
                sub: 'Approved cash tolls applied as credits',
                value: row.cashPaidBreakdown.tollCredits,
              },
              {
                label: 'Fuel credits (in cash paid)',
                sub: 'Fuel settlement credits included in this total',
                value: row.cashPaidBreakdown.fuelCreditsInCashPaid,
              },
              {
                label: 'FIFO payments',
                sub: 'Unallocated payments applied to older weeks first',
                value: row.cashPaidBreakdown.fifoPayments,
              },
              {
                label: 'Surplus payments',
                sub: 'Remaining pool assigned to this week',
                value: row.cashPaidBreakdown.surplusPayments,
              },
            ].map((line) => (
              <div
                key={line.label}
                className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{line.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{line.sub}</p>
                </div>
                <span
                  className={cn(
                    'text-sm tabular-nums font-medium shrink-0',
                    line.value > 0.005 ? 'text-emerald-700' : 'text-slate-400'
                  )}
                >
                  {fmt(line.value)}
                </span>
              </div>
            ))}

            <div className="flex items-center justify-between gap-2 pt-3 mt-1 border-t border-slate-200 dark:border-slate-700">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Total cash paid</span>
              <span className="text-base font-bold tabular-nums text-emerald-700">{fmt(row.cashPaid)}</span>
            </div>

            {!breakdownMatches && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 pt-1">
                Parts sum to {fmt(breakdownSum)}; displayed total stays {fmt(row.cashPaid)} from settlement engine.
              </p>
            )}

            <p className="text-[11px] text-slate-500 pt-2 leading-relaxed">
              Fuel credits and tolls are part of this total because they reduce what the driver still owes against
              collected cash — the same logic as the Cash Wallet weekly breakdown.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
