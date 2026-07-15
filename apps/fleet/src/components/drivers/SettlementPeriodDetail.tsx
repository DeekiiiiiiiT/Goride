// ════════════════════════════════════════════════════════════════════════════
// Settlement Period Detail — Version A waterfall (cash in → credits → Net → who owes)
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
  Fuel,
  Car,
  DollarSign,
  Banknote,
  TrendingDown,
} from 'lucide-react';
import type { SettlementRow, SettlementStatus } from './SettlementSummaryView';
import type { BankSettledDisplay } from '../../utils/fleetBankReceive';

interface SettlementPeriodDetailProps {
  row: SettlementRow | null;
  /** Fleet Financials confirm gate — Pending until ops confirms bank receipt. */
  bankSettledDisplay?: BankSettledDisplay;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusConfig: Record<
  SettlementStatus,
  { icon: React.ReactNode; color: string; bg: string; label: string }
> = {
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

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="pt-1 pb-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      {description && <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>}
    </div>
  );
}

export function SettlementPeriodDetail({
  row,
  bankSettledDisplay,
  open,
  onOpenChange,
}: SettlementPeriodDetailProps) {
  if (!row) return null;

  const periodLabel = `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;
  const cfg = statusConfig[row.settlementStatus];
  const netApplied = row.isFinalized ? row.netPayout : 0;
  // Prefer Fleet Financials gate; fall back to ledger-only if confirms not loaded.
  const bankDisplay: BankSettledDisplay =
    bankSettledDisplay ??
    (row.bankSettled > 0.005 ? { kind: 'pending' } : { kind: 'none' });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Settlement Detail</SheetTitle>
          <SheetDescription className="text-xs">{periodLabel}</SheetDescription>
        </SheetHeader>

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
          <SectionHeader
            title="1. Driver earnings"
            description="Share minus payout deductions = Net Payout (driver’s cut)"
          />

          <LineItem
            icon={<Car className="h-4 w-4" />}
            label="Ledger Gross Revenue"
            value={fmt(row.grossRevenue)}
            valueColor="text-slate-700"
            sub="Week ledger total — not the same as Overview Period Earnings"
          />
          <LineItem
            icon={<DollarSign className="h-4 w-4" />}
            label="Driver Share"
            value={fmt(row.driverShare)}
            valueColor="text-emerald-700"
          />
          <LineItem
            icon={<TrendingDown className="h-4 w-4" />}
            label="Fuel Deduction"
            value={
              row.expenseDeductions > 0.005 ? `−${fmt(row.expenseDeductions)}` : '$0.00'
            }
            valueColor={row.expenseDeductions > 0.005 ? 'text-rose-600' : 'text-slate-400'}
            sub="Driver fuel share — Share − Fuel Deduction = Net Payout"
          />
          {row.chargedToDriver > 0.005 && (
            <LineItem
              label="Charged to Driver"
              value={fmt(row.chargedToDriver)}
              valueColor="text-slate-500"
              sub="Personal tolls — settles on the cash side below, not in Net Payout"
            />
          )}

          <Separator className="my-1" />

          <LineItem
            label="Net Payout"
            value={row.isFinalized ? fmt(row.netPayout) : 'Pending'}
            valueColor={row.isFinalized ? 'text-emerald-700' : 'text-amber-600'}
            bold
            sub="Driver’s cut for this week"
          />

          {bankDisplay.kind !== 'none' && (
            <div className="pt-3">
              <SectionHeader
                title="Bank (informational)"
                description="Driver Uber allocation — wire is confirmed for the fleet org week"
              />
              <LineItem
                icon={<Wallet className="h-4 w-4" />}
                label="Bank Settled"
                value={
                  bankDisplay.kind === 'confirmed'
                    ? fmt(bankDisplay.amount)
                    : 'Pending'
                }
                valueColor={
                  bankDisplay.kind === 'confirmed' ? 'text-slate-600' : 'text-amber-600'
                }
                sub={
                  bankDisplay.kind === 'pending'
                    ? 'Confirm fleet bank receipt on Fleet Financials (org week)'
                    : 'Allocation to this driver — not the fleet wire recipient'
                }
              />
            </div>
          )}

          <div className="pt-3">
            <SectionHeader
              title="2. Cash waterfall"
              description="Passenger cash → handbacks & credits → still in hand → minus Net Payout"
            />
          </div>

          <LineItem
            icon={<Banknote className="h-4 w-4" />}
            label="Passenger cash"
            value={fmt(row.passengerCash)}
            valueColor="text-slate-700"
            sub="Uber statement cash + InDrive/Roam cash (+ float / personal charges)"
          />
          <LineItem
            icon={<Wallet className="h-4 w-4" />}
            label="− Cash Returned"
            value={row.cashHandbacks > 0.005 ? `−${fmt(row.cashHandbacks)}` : '$0.00'}
            valueColor={row.cashHandbacks > 0.005 ? 'text-emerald-700' : 'text-slate-400'}
            sub="Log Cash Payment rows tagged to this Settlement Week only"
          />
          <LineItem
            icon={<Fuel className="h-4 w-4" />}
            label="− Fleet fuel credit"
            value={
              row.fuelCreditsApplied > 0.005 ? `−${fmt(row.fuelCreditsApplied)}` : '$0.00'
            }
            valueColor={row.fuelCreditsApplied > 0.005 ? 'text-emerald-700' : 'text-slate-400'}
            sub="Company fuel share — separate from Cash Returned"
          />
          <LineItem
            label="− Cash toll credit"
            value={row.cashTollCredits > 0.005 ? `−${fmt(row.cashTollCredits)}` : '$0.00'}
            valueColor={row.cashTollCredits > 0.005 ? 'text-emerald-700' : 'text-slate-400'}
            sub="Cash plaza tolls from Toll Reconciliation — separate from Cash Returned"
          />
          {(row.chargedToDriver || 0) > 0.005 && (
            <LineItem
              label="+ Personal toll charged"
              value={`+${fmt(row.chargedToDriver)}`}
              valueColor="text-rose-700"
              sub="Tag tolls marked Personal in Toll Reconciliation — billed to driver"
            />
          )}

          <Separator className="my-1" />

          <LineItem
            label="Cash Still Held"
            value={fmt(row.cashStillHeld)}
            valueColor={row.cashStillHeld > 0.005 ? 'text-rose-700' : 'text-slate-400'}
            bold
            sub="Cash left in hand before applying Net Payout"
          />

          <LineItem
            label="− Net Payout (driver keeps)"
            value={
              row.isFinalized
                ? netApplied > 0.005
                  ? `−${fmt(netApplied)}`
                  : '$0.00'
                : 'Pending (treated as $0)'
            }
            valueColor={row.isFinalized ? 'text-emerald-700' : 'text-amber-600'}
            sub="Driver’s earned cut subtracted from cash still held"
          />

          <div className="pt-3">
            <SectionHeader title="3. Bottom line" description="Who owes whom after Net Payout" />
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
              <p
                className={`text-xl font-bold tabular-nums ${row.settlement >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
              >
                {row.settlement < 0 ? '−' : ''}
                {fmt(row.settlement)}
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
