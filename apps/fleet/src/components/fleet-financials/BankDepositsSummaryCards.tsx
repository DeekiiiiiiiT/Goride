/**
 * Bank Deposits dashboard KPI cards — computed from scoped FleetBankReceiveRow[].
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
import type { FleetBankReceiveRow } from '../../utils/fleetBankReceive';

const MONEY = (n: number) => {
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

type Metrics = {
  expectedTotal: number;
  receivedTotal: number;
  outstandingTotal: number;
  outstandingCount: number;
  confirmedCount: number;
  varianceTotal: number;
  varianceWeeks: number;
  totalWeeks: number;
};

function computeMetrics(rows: FleetBankReceiveRow[]): Metrics {
  const m: Metrics = {
    expectedTotal: 0,
    receivedTotal: 0,
    outstandingTotal: 0,
    outstandingCount: 0,
    confirmedCount: 0,
    varianceTotal: 0,
    varianceWeeks: 0,
    totalWeeks: rows.length,
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

function KpiCard({
  title,
  icon,
  accent,
  value,
  sub,
  valueClassName,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  value: string;
  sub: string;
  valueClassName?: string;
}) {
  return (
    <Card className={cn('border-l-4', accent)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100', valueClassName)}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

export function BankDepositsSummaryCards({ rows }: { rows: FleetBankReceiveRow[] }) {
  const m = useMemo(() => computeMetrics(rows), [rows]);
  const confirmedPct = m.totalWeeks > 0 ? Math.round((m.confirmedCount / m.totalWeeks) * 100) : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="Expected deposits"
        icon={<Banknote className="h-4 w-4 text-indigo-600" />}
        accent="border-l-indigo-500"
        value={MONEY(m.expectedTotal)}
        sub={`Across ${m.totalWeeks} week${m.totalWeeks === 1 ? '' : 's'} in view`}
      />
      <KpiCard
        title="Received (confirmed)"
        icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        accent="border-l-emerald-500"
        value={MONEY(m.receivedTotal)}
        sub={`${m.confirmedCount} of ${m.totalWeeks} weeks confirmed (${confirmedPct}%)`}
      />
      <KpiCard
        title="Awaiting confirmation"
        icon={<Clock3 className="h-4 w-4 text-amber-600" />}
        accent="border-l-amber-500"
        value={MONEY(m.outstandingTotal)}
        sub={
          m.outstandingCount === 0
            ? 'All weeks confirmed'
            : `${m.outstandingCount} week${m.outstandingCount === 1 ? '' : 's'} outstanding`
        }
        valueClassName={m.outstandingCount > 0 ? 'text-amber-700 dark:text-amber-400' : undefined}
      />
      <KpiCard
        title="Variance"
        icon={<Scale className="h-4 w-4 text-rose-600" />}
        accent="border-l-rose-500"
        value={m.varianceWeeks === 0 ? '$0.00' : `${m.varianceTotal > 0 ? '+' : ''}${MONEY(m.varianceTotal)}`}
        sub={
          m.varianceWeeks === 0
            ? 'No discrepancies on confirmed weeks'
            : `${m.varianceWeeks} confirmed week${m.varianceWeeks === 1 ? '' : 's'} off from expected`
        }
        valueClassName={m.varianceWeeks > 0 ? 'text-rose-700 dark:text-rose-400' : undefined}
      />
    </div>
  );
}
