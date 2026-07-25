import React from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { SafeResponsiveContainer as ResponsiveContainer } from '../../ui/SafeResponsiveContainer';
import type { DailyConsumptionPoint, WeeklyEfficiencyPoint } from '../../../utils/fuelAnalyticsAggregates';

type Props = {
  daily: DailyConsumptionPoint[];
  efficiencyTrend: WeeklyEfficiencyPoint[];
  targetKmL: number;
};

export function FuelAnalyticsTrends({ daily, efficiencyTrend, targetKmL }: Props) {
  const hasDaily = daily.some((d) => d.liters > 0 || d.distanceKm > 0);
  const hasTrend = efficiencyTrend.some((p) => p.efficiencyKmL != null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
      <Card className="overflow-hidden min-h-[360px] flex flex-col">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">Consumption vs Distance</CardTitle>
            <div className="flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Liters
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Km Traveled
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 pt-4 min-h-[280px]">
          {!hasDaily ? (
            <div className="flex items-center justify-center h-[260px] text-sm text-slate-400">
              No consumption data in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar yAxisId="l" dataKey="liters" name="Liters" fill="#6366f1" radius={[4, 4, 0, 0]} opacity={0.85} />
                <Line
                  yAxisId="r"
                  type="monotone"
                  dataKey="distanceKm"
                  name="Km Traveled"
                  stroke="#34d399"
                  strokeWidth={3}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden min-h-[360px] flex flex-col">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">Fleet Efficiency Trend</CardTitle>
            <span className="text-xs text-slate-500 flex items-center gap-2">
              <span className="w-6 border-t-2 border-dashed border-rose-400" />
              Target ({targetKmL} km/L)
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex-1 pt-4 min-h-[280px]">
          {!hasTrend ? (
            <div className="flex items-center justify-center h-[260px] text-sm text-slate-400">
              Need odometer spans across weeks to chart efficiency.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={efficiencyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(v: number) => [`${v} km/L`, '']}
                />
                <Legend />
                <ReferenceLine y={targetKmL} stroke="#f43f5e" strokeDasharray="4 4" strokeOpacity={0.5} />
                <Line
                  type="monotone"
                  dataKey="efficiencyKmL"
                  name="Fleet km/L"
                  stroke="#4f46e5"
                  strokeWidth={3}
                  connectNulls
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="movingAvg"
                  name="3-wk avg"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  connectNulls
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
