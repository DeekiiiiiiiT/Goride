// ════════════════════════════════════════════════════════════════════════════
// Settlement Period Detail — Overlay showing full breakdown for one week
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
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  MinusCircle,
  Wallet,
  Receipt,
  Fuel,
  Car,
  DollarSign,
  Banknote,
  TrendingDown,
  LinkIcon,
  Unlink,
} from 'lucide-react';
import type { SettlementRow, SettlementStatus } from './SettlementSummaryView';

interface SettlementPeriodDetailProps {
  row: SettlementRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Currency formatter ──
const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Status config ──
const statusConfig: Record<SettlementStatus, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  Settled: {
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    label: 'Settled',
  },
  'Company Owes': {
    icon: <ArrowUpCircle className="h-4 w-4" />,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    label: 'Company Owes Driver',
  },
  'Driver Owes': {
    icon: <ArrowDownCircle className="h-4 w-4" />,
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    label: 'Driver Owes Company',
  },
  Pending: {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    label: 'Pending — Not Yet Finalized',
  },
  'No Activity': {
    icon: <MinusCircle className="h-4 w-4" />,
    color: 'text-slate-500',
    bg: 'bg-slate-100',
    label: 'No Activity',
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

export function SettlementPeriodDetail({ row, open, onOpenChange }: SettlementPeriodDetailProps) {
  if (!row) return null;

  const periodLabel = `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;
  const cfg = statusConfig[row.settlementStatus];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Settlement Detail</SheetTitle>
          <SheetDescription className="text-xs">{periodLabel}</SheetDescription>
        </SheetHeader>

        {/* ── Status banner ── */}
        <div className={`mx-4 rounded-lg px-4 py-3 flex items-center gap-3 ${cfg.bg}`}>
          <span className={cfg.color}>{cfg.icon}</span>
          <div>
            <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {row.tripCount} trip{row.tripCount !== 1 ? 's' : ''} this period
              {!row.isFinalized && row.grossRevenue > 0 && ' · Fuel report not yet finalized'}
            </p>
          </div>
        </div>

        <div className="px-4 pt-4 pb-6 space-y-1">
          {/* ── Payout Section ── */}
          <SectionHeader title="Payout Breakdown" description="Revenue and deductions for this period" />

          <LineItem
            icon={<Car className="h-4 w-4" />}
            label="Gross Revenue"
            value={fmt(row.grossRevenue)}
            valueColor="text-slate-700"
          />
          <LineItem
            icon={<DollarSign className="h-4 w-4" />}
            label="Driver Share"
            value={fmt(row.driverShare)}
            valueColor="text-emerald-700"
            sub="After commission split"
          />

          <Separator className="my-1" />

          <LineItem
            icon={<Receipt className="h-4 w-4" />}
            label="Toll Expenses"
            value={row.tollExpenses > 0.005 ? `−${fmt(row.tollExpenses)}` : '$0.00'}
            valueColor={row.tollExpenses > 0.005 ? 'text-rose-600' : 'text-slate-400'}
            sub={
              (row.tollReconciled + row.tollUnreconciled) > 0
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
          />

          <Separator className="my-1" />

          <LineItem
            label="Net Payout"
            value={row.isFinalized ? fmt(row.netPayout) : 'Pending'}
            valueColor={row.isFinalized ? 'text-emerald-700' : 'text-amber-600'}
            bold
            sub="Driver Share minus Deductions"
          />

          {/* ── Cash Section ── */}
          <div className="pt-3">
            <SectionHeader title="Cash Settlement" description="Cash collected vs. returned" />
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
            valueColor={row.cashBalance > 0.005 ? 'text-rose-700' : 'text-slate-400'}
            bold
            sub={
              row.cashBalance > 0.005
                ? 'Driver still holding this cash'
                : 'All cash returned'
            }
          />

          {/* ── Bottom Line ── */}
          <div className="pt-3">
            <SectionHeader title="Bottom Line" description="Net Payout minus Cash Balance" />
          </div>

          <div className={`rounded-lg px-4 py-4 ${row.settlement >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700">Settlement</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {row.settlementStatus === 'Pending'
                    ? 'Final amount pending fuel report'
                    : row.settlementStatus === 'Settled'
                      ? 'Both sides are even'
                      : row.settlement >= 0
                        ? 'Company needs to pay the driver'
                        : 'Driver needs to return to company'}
                </p>
              </div>
              <p className={`text-xl font-bold tabular-nums ${row.settlement >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {row.settlement < 0 ? '−' : ''}{fmt(row.settlement)}
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}