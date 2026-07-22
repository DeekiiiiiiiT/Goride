/**
 * Expense Hub Overview — Spend over time chart.
 * Day/Week/Month grain + As paid / Spread over coverage lenses.
 */
import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Skeleton } from '../../ui/skeleton';
import { SafeResponsiveContainer as ResponsiveContainer } from '../../ui/SafeResponsiveContainer';
import { cn } from '../../ui/utils';
import { formatMoney } from '../money';
import { useExpenseHubSpendBreakdown } from '../../../hooks/useExpenseHub';
import type { ExpenseSpendGrain, ExpenseSpendLens } from '../../../types/expenseHub';
import {
  defaultSpendGrain,
  rollSpendSeries,
  runRateAverages,
} from '../../../utils/expenseCoverageRunRate';

const LENS_OPTIONS: Array<{ id: ExpenseSpendLens; label: string }> = [
  { id: 'spread', label: 'Spread over coverage' },
  { id: 'as_paid', label: 'As paid' },
];

const GRAIN_OPTIONS: Array<{ id: ExpenseSpendGrain; label: string }> = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

export function ExpenseHubSpendOverTime({
  startYmd,
  endYmd,
  lens,
  onLensChange,
}: {
  startYmd: string;
  endYmd: string;
  lens: ExpenseSpendLens;
  onLensChange: (lens: ExpenseSpendLens) => void;
}) {
  const { data, isLoading, isError } = useExpenseHubSpendBreakdown(startYmd, endYmd);
  const [grain, setGrain] = React.useState<ExpenseSpendGrain>(() =>
    defaultSpendGrain(startYmd, endYmd),
  );

  React.useEffect(() => {
    setGrain(defaultSpendGrain(startYmd, endYmd));
  }, [startYmd, endYmd]);

  const lensData = lens === 'spread' ? data?.spread : data?.asPaid;
  const chartData = React.useMemo(() => {
    if (!lensData?.seriesDaily) return [];
    return rollSpendSeries(lensData.seriesDaily, grain).map((b) => ({
      name: b.label,
      amount: b.amount,
    }));
  }, [lensData, grain]);

  const averages = React.useMemo(() => {
    if (!lensData) return { perDay: 0, perWeek: 0, perMonth: 0 };
    return runRateAverages(lensData.periodTotal, startYmd, endYmd);
  }, [lensData, startYmd, endYmd]);

  const showEmptyCashBanner =
    lens === 'spread' &&
    data?.meta &&
    !data.meta.hasCashInPeriod &&
    data.meta.hasCoverageInPeriod;

  const chipClass = (active: boolean) =>
    cn(
      'min-h-11 px-3 text-xs font-medium',
      active
        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
        : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200',
    );

  return (
    <Card className="rounded-lg border-slate-200 dark:border-slate-800 overflow-hidden">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">Spend over time</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Cost view">
              {LENS_OPTIONS.map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant={lens === opt.id ? 'default' : 'outline'}
                  className={chipClass(lens === opt.id)}
                  onClick={() => onLensChange(opt.id)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Time grain">
              {GRAIN_OPTIONS.map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant={grain === opt.id ? 'default' : 'outline'}
                  className={chipClass(grain === opt.id)}
                  onClick={() => setGrain(opt.id)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {lens === 'spread'
            ? 'Annual and other coverage costs are divided across their coverage dates so you can see true daily / weekly / monthly cost.'
            : 'Shows amounts on the dates they were due or incurred in this period.'}
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {showEmptyCashBanner && (
          <p
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            role="status"
          >
            No payments in this range. Showing run-rate from costs still covering this period.
          </p>
        )}

        {isError && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            Spend trend unavailable for this period.
          </p>
        )}

        {isLoading || !data ? (
          <div className="space-y-3" aria-busy="true">
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
            <Skeleton className="h-[220px] w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Avg / day
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-indigo-700 dark:text-indigo-400">
                  {formatMoney(averages.perDay)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Avg / week
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatMoney(averages.perWeek)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Avg / month
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatMoney(averages.perMonth)}
                </p>
              </div>
            </div>

            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="expenseSpendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v: number) =>
                      Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                    }
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(value: number) => [formatMoney(value), 'Spend']}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#expenseSpendGrad)"
                    name="Spend"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <p className="text-right text-xs tabular-nums text-slate-500">
              Period total · {formatMoney(lensData?.periodTotal || 0)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
