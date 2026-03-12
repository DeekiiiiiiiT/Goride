// ════════════════════════════════════════════════════════════════════════════
// Payout Period Detail — Sheet overlay showing full breakdown for one period
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/sheet';
import { Separator } from '../ui/separator';
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
} from 'lucide-react';

// Mirror the types from DriverPayoutHistory — keep in sync
type PayoutStatus = 'Finalized' | 'Awaiting Cash' | 'Pending';

export interface PayoutPeriodRow {
  periodStart: Date;
  periodEnd: Date;
  grossRevenue: number;
  driverSharePercent: number;
  driverShare: number;
  tollExpenses: number;
  fuelDeduction: number;
  totalDeductions: number;
  netPayout: number;
  isFinalized: boolean;
  tripCount: number;
  tierName: string;
  cashOwed: number;
  cashPaid: number;
  cashBalance: number;
  status: PayoutStatus;
}

interface PayoutPeriodDetailProps {
  row: PayoutPeriodRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Currency formatter ──
const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Status config ──
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

// ── Line item helper ──
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
          {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
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

// ── Section header ──
function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="pt-1 pb-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      {description && <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>}
    </div>
  );
}

export function PayoutPeriodDetail({ row, open, onOpenChange }: PayoutPeriodDetailProps) {
  if (!row) return null;

  const periodLabel = `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;
  const cfg = statusConfig[row.status];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Payout Detail</SheetTitle>
          <SheetDescription className="text-xs">{periodLabel}</SheetDescription>
        </SheetHeader>

        {/* ── Status banner ── */}
        <div className={`mx-4 rounded-lg px-4 py-3 flex items-center gap-3 ${cfg.bg}`}>
          <span className={cfg.color}>{cfg.icon}</span>
          <div>
            <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{cfg.description}</p>
          </div>
        </div>

        <div className="px-4 pt-4 pb-6 space-y-1">
          {/* ── Revenue & Tier ── */}
          <SectionHeader title="Revenue & Tier" description="Gross earnings and commission split" />

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

          <Separator className="my-1" />

          {/* ── Deductions ── */}
          <SectionHeader title="Deductions" description="Tolls and fuel subtracted from Driver Share" />

          <LineItem
            icon={<Receipt className="h-4 w-4" />}
            label="Toll Expenses"
            value={row.tollExpenses > 0.005 ? `−${fmt(row.tollExpenses)}` : '$0.00'}
            valueColor={row.tollExpenses > 0.005 ? 'text-rose-600' : 'text-slate-400'}
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

          <Separator className="my-1" />

          {/* ── Net Payout ── */}
          <div className={`rounded-lg px-4 py-4 ${row.isFinalized ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700">Net Payout</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {row.isFinalized
                    ? 'Driver Share minus all deductions'
                    : 'Will be computed once fuel report is finalized'}
                </p>
              </div>
              <p className={`text-xl font-bold tabular-nums ${
                row.isFinalized
                  ? (row.netPayout >= 0 ? 'text-emerald-700' : 'text-rose-700')
                  : 'text-amber-600'
              }`}>
                {row.isFinalized ? fmt(row.netPayout) : 'Pending'}
              </p>
            </div>
          </div>

          {/* ── Cash Position ── */}
          {(row.cashOwed > 0.005 || row.cashPaid > 0.005 || row.cashBalance > 0.005) && (
            <>
              <div className="pt-3">
                <SectionHeader title="Cash Position" description="Cash collected vs. returned for this period" />
              </div>

              <LineItem
                icon={<Banknote className="h-4 w-4" />}
                label="Cash Owed"
                value={row.cashOwed > 0.005 ? fmt(row.cashOwed) : '$0.00'}
                valueColor={row.cashOwed > 0.005 ? 'text-slate-700' : 'text-slate-400'}
                sub="Cash collected from passengers"
              />
              <LineItem
                icon={<Wallet className="h-4 w-4" />}
                label="Cash Paid"
                value={row.cashPaid > 0.005 ? fmt(row.cashPaid) : '$0.00'}
                valueColor={row.cashPaid > 0.005 ? 'text-emerald-700' : 'text-slate-400'}
                sub="Returned to company"
              />

              <Separator className="my-1" />

              <LineItem
                label="Cash Balance"
                value={fmt(row.cashBalance)}
                valueColor={row.cashBalance > 0.005 ? 'text-rose-700' : 'text-emerald-700'}
                bold
                sub={
                  row.cashBalance > 0.005
                    ? 'Driver still holding this cash'
                    : 'All cash returned'
                }
              />
            </>
          )}

          {/* ── Settlement Bottom Line ── */}
          {/* Only shown when there's cash activity — combines Net Payout and Cash Balance
              into the true settlement figure, matching the Settlement tab's formula:
              Settlement = Cash Balance − Net Payout */}
          {(row.cashOwed > 0.005 || row.cashPaid > 0.005 || row.cashBalance > 0.005) && (() => {
            const netPayout = row.isFinalized ? row.netPayout : 0;
            const settlement = row.cashBalance - netPayout;
            // Positive settlement = driver owes the fleet
            // Negative settlement = fleet owes the driver
            // Zero = fully settled
            const driverOwes = settlement > 0.005;
            const companyOwes = settlement < -0.005;
            const isSettled = !driverOwes && !companyOwes;

            return (
              <>
                <div className="pt-3">
                  <SectionHeader
                    title="Settlement"
                    description="Cash Balance minus Net Payout — the true amount owed"
                  />
                </div>

                <LineItem
                  icon={<Banknote className="h-4 w-4" />}
                  label="Cash Balance"
                  value={fmt(row.cashBalance)}
                  valueColor="text-slate-700"
                />
                <LineItem
                  icon={<DollarSign className="h-4 w-4" />}
                  label="Net Payout"
                  value={row.isFinalized ? `−${fmt(netPayout)}` : 'Pending'}
                  valueColor={row.isFinalized ? 'text-emerald-600' : 'text-amber-600'}
                  sub="Subtracted because the company owes the driver this amount"
                />

                <Separator className="my-1" />

                <div className={`rounded-lg px-4 py-4 mt-2 ${
                  !row.isFinalized ? 'bg-amber-50' :
                  driverOwes ? 'bg-rose-50' :
                  companyOwes ? 'bg-blue-50' :
                  'bg-emerald-50'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Scale className={`h-5 w-5 ${
                        !row.isFinalized ? 'text-amber-600' :
                        driverOwes ? 'text-rose-600' :
                        companyOwes ? 'text-blue-600' :
                        'text-emerald-600'
                      }`} />
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Settlement</p>
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
                    <p className={`text-xl font-bold tabular-nums ${
                      !row.isFinalized ? 'text-amber-600' :
                      driverOwes ? 'text-rose-700' :
                      companyOwes ? 'text-blue-700' :
                      'text-emerald-700'
                    }`}>
                      {isSettled && row.isFinalized ? '$0.00' : fmt(settlement)}
                    </p>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </SheetContent>
    </Sheet>
  );
}