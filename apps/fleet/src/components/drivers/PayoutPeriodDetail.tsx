/**
 * Paycheck period detail — earned cut → cash held → Amount Due (SSOT settlement math).
 * Narration matches: Amount Due = Net Take-Home − Cash Still Held.
 */
import React, { useState } from 'react';
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
  Fuel,
  Car,
  DollarSign,
  Banknote,
  TrendingDown,
  Award,
  Percent,
  Scale,
} from 'lucide-react';
import type { PayoutPeriodRow, PayoutStatus } from '../../types/driverPayoutPeriod';
import { getPeriodSettlementComponents } from '../../utils/driverSettlementMath';
import { payoutStatusLabel } from '../../utils/computePayoutSummaryTotals';

interface PayoutPeriodDetailProps {
  row: PayoutPeriodRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** False for daily view — cash columns are weekly-only. */
  showCash?: boolean;
}

const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusConfig: Record<
  PayoutStatus,
  { icon: React.ReactNode; color: string; bg: string; description: string }
> = {
  Finalized: {
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    description: 'Fuel confirmed and cash cleared — week is closed',
  },
  'Awaiting Cash': {
    icon: <Wallet className="h-4 w-4" />,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    description: 'Fuel confirmed — cash still needs to be settled',
  },
  Pending: {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    description: 'Fuel report not finalized — numbers may be estimates',
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
        className={`text-sm tabular-nums whitespace-nowrap ml-4 ${bold ? 'font-bold' : 'font-medium'} ${
          valueColor || 'text-slate-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">{title}</h3>
      {description && <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>}
    </div>
  );
}

export function PayoutPeriodDetail({
  row,
  open,
  onOpenChange,
  showCash = true,
}: PayoutPeriodDetailProps) {
  const [secEarned, setSecEarned] = useState(true);
  const [secCash, setSecCash] = useState(true);

  if (!row) return null;

  const periodLabel = `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;
  const cfg = statusConfig[row.status];
  const isEstimate = Boolean(row.isEstimate && !row.isFinalized);
  const { settlement, adjCashBalance, netPayoutApplied } = getPeriodSettlementComponents(row, {
    includeEstimate: isEstimate,
  });

  const passengerCash =
    row.passengerCash != null && row.passengerCash > 0.005 ? row.passengerCash : row.cashOwed;
  const cashReturned = Math.max(0, row.cashPaid || 0);
  const fuelCredits = Math.max(0, row.fuelCredits || 0);
  const cashTollWash = Math.max(0, row.cashTollWash || 0);
  const tollPersonal = Math.max(0, row.personalTollCharge || 0);
  const netTakeHome = isEstimate || row.isFinalized ? row.netPayout : netPayoutApplied;

  const driverOwes = settlement < -0.005;
  const companyOwes = settlement > 0.005;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Payout Detail</SheetTitle>
          <SheetDescription className="text-xs">{periodLabel}</SheetDescription>
        </SheetHeader>

        <div className={`mx-4 rounded-lg px-4 py-3 flex items-center gap-3 ${cfg.bg}`}>
          <span className={cfg.color}>{cfg.icon}</span>
          <div>
            <p className={`text-sm font-semibold ${cfg.color}`}>{payoutStatusLabel(row.status)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{cfg.description}</p>
          </div>
        </div>

        <div className="px-4 pt-4 pb-6 space-y-5">
          <div>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setSecEarned((v) => !v)}
            >
              <SectionHeader
                title="1. Take-home"
                description="Driver Share − Fuel = Net Take-Home"
              />
            </button>
            {secEarned && (
              <div className="mt-1">
                <LineItem
                  icon={<Car className="h-4 w-4" />}
                  label="Gross Revenue"
                  value={fmt(row.grossRevenue)}
                  valueColor="text-emerald-700"
                  sub={`${row.tripCount} trip${row.tripCount !== 1 ? 's' : ''}`}
                />
                <LineItem
                  icon={<Award className="h-4 w-4" />}
                  label="Tier"
                  value={`${row.tierName} (${row.driverSharePercent}%)`}
                />
                <LineItem
                  icon={<Percent className="h-4 w-4" />}
                  label="Driver Share"
                  value={fmt(row.driverShare)}
                  valueColor="text-emerald-700"
                  bold
                />
                <LineItem
                  icon={<Fuel className="h-4 w-4" />}
                  label={isEstimate ? '− Fuel Deduction (est.)' : '− Fuel Deduction'}
                  value={
                    row.isFinalized || isEstimate
                      ? row.fuelDeduction > 0.005
                        ? `−${fmt(row.fuelDeduction)}`
                        : '$0.00'
                      : 'Pending'
                  }
                  valueColor={
                    !row.isFinalized && !isEstimate
                      ? 'text-amber-600'
                      : row.fuelDeduction > 0.005
                        ? 'text-rose-600'
                        : 'text-slate-400'
                  }
                />
                <LineItem
                  icon={<Scale className="h-4 w-4" />}
                  label="Charged to Driver"
                  value={tollPersonal > 0.005 ? fmt(tollPersonal) : '$0.00'}
                  valueColor={tollPersonal > 0.005 ? 'text-rose-700' : 'text-slate-400'}
                  sub="Personal / non-trip tag tolls — settles on cash below, not in Net Take-Home"
                />
                <div
                  className={`rounded-lg px-3 py-3 mt-2 border ${
                    row.isFinalized || isEstimate
                      ? 'bg-emerald-50/80 border-emerald-100'
                      : 'bg-amber-50/80 border-amber-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        Net Take-Home{isEstimate ? ' (est.)' : ''}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        What the driver keeps before cash settle
                      </p>
                    </div>
                    <p
                      className={`text-lg font-bold tabular-nums ${
                        row.isFinalized || isEstimate ? 'text-emerald-700' : 'text-amber-600'
                      }`}
                    >
                      {row.isFinalized || isEstimate ? fmt(netTakeHome) : 'Pending'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {showCash && (
            <div>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setSecCash((v) => !v)}
              >
                <SectionHeader
                  title="2. Cash still held"
                  description="Passenger cash → returns & credits"
                />
              </button>
              {secCash && (
                <div className="mt-1">
                  <LineItem
                    icon={<Banknote className="h-4 w-4" />}
                    label="Passenger cash"
                    value={fmt(passengerCash)}
                    valueColor="text-slate-700"
                  />
                  <LineItem
                    icon={<Wallet className="h-4 w-4" />}
                    label="− Cash Returned"
                    value={cashReturned > 0.005 ? `−${fmt(cashReturned)}` : '$0.00'}
                    valueColor={cashReturned > 0.005 ? 'text-emerald-700' : 'text-slate-400'}
                  />
                  <LineItem
                    icon={<Fuel className="h-4 w-4" />}
                    label="− Fleet fuel credit"
                    value={fuelCredits > 0.005 ? `−${fmt(fuelCredits)}` : '$0.00'}
                    valueColor={fuelCredits > 0.005 ? 'text-emerald-700' : 'text-slate-400'}
                  />
                  <LineItem
                    label="− Cash toll credit"
                    value={cashTollWash > 0.005 ? `−${fmt(cashTollWash)}` : '$0.00'}
                    valueColor={cashTollWash > 0.005 ? 'text-emerald-700' : 'text-slate-400'}
                  />
                  {tollPersonal > 0.005 ? (
                    <LineItem
                      label="+ Personal toll charged"
                      value={`+${fmt(tollPersonal)}`}
                      valueColor="text-rose-700"
                      sub="Same as Charged to Driver — company tag bill the driver owes back"
                    />
                  ) : (
                    <LineItem
                      label="+ Personal toll charged"
                      value="$0.00"
                      valueColor="text-slate-400"
                      sub="Same as Charged to Driver when personal tag tolls are billed"
                    />
                  )}
                  <Separator className="my-1" />
                  <LineItem
                    label={isEstimate ? 'Cash Still Held (est.)' : 'Cash Still Held'}
                    value={fmt(adjCashBalance)}
                    valueColor={adjCashBalance > 0.005 ? 'text-rose-700' : 'text-slate-400'}
                    bold
                  />
                </div>
              )}
            </div>
          )}

          {showCash && (
            <div>
              <SectionHeader
                title="3. Amount due"
                description="Net Take-Home − Cash Still Held"
              />
              <div className="mt-2 space-y-1">
                <LineItem
                  icon={<DollarSign className="h-4 w-4" />}
                  label="Net Take-Home"
                  value={
                    row.isFinalized || isEstimate
                      ? netTakeHome > 0.005
                        ? fmt(netTakeHome)
                        : '$0.00'
                      : 'Pending ($0)'
                  }
                  valueColor={
                    row.isFinalized || isEstimate ? 'text-emerald-700' : 'text-amber-600'
                  }
                />
                <LineItem
                  icon={<TrendingDown className="h-4 w-4" />}
                  label="− Cash Still Held"
                  value={adjCashBalance > 0.005 ? `−${fmt(adjCashBalance)}` : '$0.00'}
                  valueColor={adjCashBalance > 0.005 ? 'text-rose-700' : 'text-slate-400'}
                />
              </div>

              <div
                className={`rounded-lg px-4 py-4 mt-3 ${
                  companyOwes ? 'bg-blue-50' : driverOwes ? 'bg-rose-50' : 'bg-emerald-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <Scale
                      className={`h-4 w-4 mt-0.5 shrink-0 ${
                        companyOwes
                          ? 'text-blue-600'
                          : driverOwes
                            ? 'text-rose-600'
                            : 'text-emerald-600'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        Amount Due{isEstimate ? ' (est.)' : ''}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {!row.isFinalized && !isEstimate
                          ? 'Final amount pending fuel report'
                          : companyOwes
                            ? 'Fleet needs to pay the driver'
                            : driverOwes
                              ? 'Driver needs to return to company'
                              : 'Both sides are even'}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`text-xl font-bold tabular-nums shrink-0 ${
                      companyOwes
                        ? 'text-blue-700'
                        : driverOwes
                          ? 'text-rose-700'
                          : 'text-emerald-700'
                    }`}
                  >
                    {settlement < 0 ? '−' : settlement > 0 ? '+' : ''}
                    {fmt(settlement)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
