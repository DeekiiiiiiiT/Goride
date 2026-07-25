import React from 'react';
import { AlertTriangle, Droplets } from 'lucide-react';
import { Cell, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { SafeResponsiveContainer as ResponsiveContainer } from '../../ui/SafeResponsiveContainer';
import { cn } from '../../ui/utils';
import { formatJMD } from '../../vehicles/analytics/AnalyticsKpiGrid';
import type {
  FlaggedEvent,
  FuelCompositionSlice,
  PricePoint,
} from '../../../utils/fuelAnalyticsAggregates';

type Props = {
  flagged: FlaggedEvent[];
  composition: FuelCompositionSlice[];
  priceSeries: PricePoint[];
};

export function FuelAnalyticsAnomalies({ flagged, composition, priceSeries }: Props) {
  const hasPrice = priceSeries.some((p) => p.avgPrice != null);
  const marketAvg =
    priceSeries.filter((p) => p.avgPrice != null).reduce((s, p, _, arr) => s + (p.avgPrice || 0) / arr.length, 0) ||
    null;

  const priceChart = priceSeries.map((p) => ({
    ...p,
    market: marketAvg,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Flagged Events Feed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {flagged.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No anomalies in this period.</p>
          ) : (
            flagged.map((ev) => (
              <div
                key={ev.id}
                className={cn(
                  'rounded-lg border p-3 flex gap-3',
                  ev.severity === 'critical'
                    ? 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20'
                    : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20',
                )}
              >
                <div
                  className={cn(
                    'p-2 rounded-lg h-fit',
                    ev.severity === 'critical' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700',
                  )}
                >
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-xs font-bold uppercase tracking-wide',
                      ev.severity === 'critical' ? 'text-rose-600' : 'text-amber-700',
                    )}
                  >
                    {ev.title}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{ev.detail}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{ev.date}</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fuel Cost Composition</CardTitle>
        </CardHeader>
        <CardContent>
          {composition.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">No fuel spend to split.</p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={composition}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                  >
                    {composition.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatJMD(v, 2)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 w-full">
                {composition.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-slate-600 dark:text-slate-300">{s.name}</span>
                    <span className="ml-auto font-semibold tabular-nums">{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Fuel Price Tracking</CardTitle>
          <Droplets className="h-4 w-4 text-indigo-500" />
        </CardHeader>
        <CardContent className="min-h-[220px]">
          {!hasPrice ? (
            <p className="text-sm text-slate-400 py-12 text-center">No price/litre data in period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={priceChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(v: number, name: string) => [formatJMD(v, 2), name === 'avgPrice' ? 'Avg Paid' : 'Period Avg']}
                />
                <Line type="monotone" dataKey="market" name="Period Avg" stroke="#10b981" strokeDasharray="4 4" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="avgPrice" name="Avg Paid" stroke="#4f46e5" strokeWidth={3} connectNulls dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
