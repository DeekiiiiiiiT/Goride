/**
 * Bank Deposits dashboard KPI cards — 4 existing metrics with platform allocation.
 * Display-only; never feeds settlement math.
 */
import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { cn } from '../ui/utils';
import {
  Banknote,
  CheckCircle2,
  Clock3,
  Scale,
} from 'lucide-react';
import type { FleetBankPlatform, FleetBankReceiveRow } from '../../utils/fleetBankReceive';
import { fleetBankPlatformLabel } from '../../utils/fleetBankReceive';

const MONEY = (n: number) => {
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

const PLATFORM_ORDER: FleetBankPlatform[] = ['uber', 'roam', 'indrive'];

type PlatformMetrics = {
  expectedTotal: number;
  receivedTotal: number;
  outstandingTotal: number;
  varianceTotal: number;
  varianceWeeks: number;
  confirmedCount: number;
  outstandingCount: number;
};

function computeMetrics(rows: FleetBankReceiveRow[]): PlatformMetrics {
  const m: PlatformMetrics = {
    expectedTotal: 0,
    receivedTotal: 0,
    outstandingTotal: 0,
    varianceTotal: 0,
    varianceWeeks: 0,
    confirmedCount: 0,
    outstandingCount: 0,
  };
  for (const r of rows) {
    m.expectedTotal += r.expected ?? 0;
    if (r.status === 'confirmed') {
      m.confirmedCount += 1;
      m.receivedTotal += r.amountReceived ?? 0;
      if (r.variance != null && Math.abs(r.variance) > 0.005) {
        m.varianceTotal += r.variance;
        m.varianceWeeks += 1;
      }
    } else {
      m.outstandingCount += 1;
      m.outstandingTotal += r.expected ?? 0;
    }
  }
  return m;
}

function metricsForPlatform(
  rows: FleetBankReceiveRow[],
  platform: FleetBankPlatform,
): PlatformMetrics {
  return computeMetrics(rows.filter((r) => r.platform === platform));
}

function PlatformSplit({
  label,
  amount,
}: {
  label: string;
  amount: number;
}) {
  if (amount === 0 && label === '') return null;
  return (
    <div className="flex justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span>{label}</span>
      <span className="tabular-nums font-medium text-slate-700 dark:text-slate-200">{MONEY(amount)}</span>
    </div>
  );
}

function KpiCard({
  title,
  icon,
  accent,
  value,
  sub,
  valueClassName,
  platformLines,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  value: string;
  sub: string;
  valueClassName?: string;
  platformLines: Array<{ platform: FleetBankPlatform; amount: number }>;
}) {
  const hasAllocation = platformLines.length > 0 && platformLines.some((p) => p.amount !== 0);
  return (
    <Card className={cn('border-l-4', accent)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100',
            valueClassName,
          )}
        >
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        {hasAllocation && (
          <div className="mt-2 space-y-0.5 border-t border-slate-100 dark:border-slate-800 pt-2">
            {platformLines.map((p) => (
              <PlatformSplit
                key={p.platform}
                label={fleetBankPlatformLabel(p.platform)}
                amount={p.amount}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BankDepositsSummaryCards({ rows }: { rows: FleetBankReceiveRow[] }) {
  const byPlatform = useMemo(() => {
    return {
      uber: metricsForPlatform(rows, 'uber'),
      roam: metricsForPlatform(rows, 'roam'),
      indrive: metricsForPlatform(rows, 'indrive'),
    };
  }, [rows]);

  const totalExpected =
    byPlatform.uber.expectedTotal +
    byPlatform.roam.expectedTotal +
    byPlatform.indrive.expectedTotal;
  const totalReceived =
    byPlatform.uber.receivedTotal +
    byPlatform.roam.receivedTotal +
    byPlatform.indrive.receivedTotal;
  const totalOutstanding =
    byPlatform.uber.outstandingTotal +
    byPlatform.roam.outstandingTotal +
    byPlatform.indrive.outstandingTotal;
  const totalVarianceWeeks =
    byPlatform.uber.varianceWeeks +
    byPlatform.roam.varianceWeeks +
    byPlatform.indrive.varianceWeeks;
  const totalVariance =
    byPlatform.uber.varianceTotal +
    byPlatform.roam.varianceTotal +
    byPlatform.indrive.varianceTotal;

  const expectedLines = PLATFORM_ORDER.map((p) => ({
    platform: p,
    amount: byPlatform[p].expectedTotal,
  }));
  const receivedLines = PLATFORM_ORDER.map((p) => ({
    platform: p,
    amount: byPlatform[p].receivedTotal,
  }));
  const awaitingLines = PLATFORM_ORDER.map((p) => ({
    platform: p,
    amount: byPlatform[p].outstandingTotal,
  }));
  const varianceLines = PLATFORM_ORDER.map((p) => ({
    platform: p,
    amount: byPlatform[p].varianceTotal,
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="Expected deposits"
        icon={<Banknote className="h-4 w-4 text-indigo-600" />}
        accent="border-l-indigo-500"
        value={MONEY(totalExpected)}
        sub={`Across ${rows.length} week${rows.length === 1 ? '' : 's'} in view · Uber + Roam + InDrive`}
        platformLines={expectedLines}
      />
      <KpiCard
        title="Received (confirmed)"
        icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        accent="border-l-emerald-500"
        value={MONEY(totalReceived)}
        sub={`${rows.filter((r) => r.status === 'confirmed').length} of ${rows.length} weeks confirmed`}
        platformLines={receivedLines}
      />
      <KpiCard
        title="Awaiting confirmation"
        icon={<Clock3 className="h-4 w-4 text-amber-600" />}
        accent="border-l-amber-500"
        value={MONEY(totalOutstanding)}
        sub={
          totalOutstanding === 0
            ? 'All weeks confirmed'
            : 'Outstanding expected · Uber + Roam + InDrive'
        }
        platformLines={awaitingLines}
      />
      <KpiCard
        title="Variance"
        icon={<Scale className="h-4 w-4 text-rose-600" />}
        accent="border-l-rose-500"
        value={totalVarianceWeeks === 0 ? '$0.00' : `${totalVariance > 0 ? '+' : ''}${MONEY(totalVariance)}`}
        sub={
          totalVarianceWeeks === 0
            ? 'No discrepancies on confirmed weeks'
            : `${totalVarianceWeeks} confirmed week${totalVarianceWeeks === 1 ? '' : 's'} off from expected`
        }
        platformLines={varianceLines}
        valueClassName={totalVarianceWeeks > 0 ? 'text-rose-700 dark:text-rose-400' : undefined}
      />
    </div>
  );
}
