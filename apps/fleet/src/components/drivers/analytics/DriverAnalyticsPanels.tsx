import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { SafeResponsiveContainer as ResponsiveContainer } from '../../ui/SafeResponsiveContainer';
import { formatJMD } from '../../vehicles/analytics/AnalyticsKpiGrid';
import { cn } from '../../ui/utils';
import type {
  DriverAlert,
  PlatformSlice,
} from '../../../utils/driverAnalyticsAggregates';

type Heatmap = { days: string[]; hours: number[]; cells: number[][] };

type Props = {
  alerts: DriverAlert[];
  platformMix: PlatformSlice[];
  heatmap: Heatmap;
  tenure: Array<{ label: string; count: number }>;
  onSelectDriver?: (driverId: string) => void;
};

function heatBg(count: number, max: number): string {
  if (count <= 0 || max <= 0) return 'bg-slate-100 dark:bg-slate-800';
  const t = count / max;
  if (t > 0.75) return 'bg-indigo-600';
  if (t > 0.5) return 'bg-indigo-400';
  if (t > 0.25) return 'bg-indigo-300';
  return 'bg-indigo-200';
}

export function DriverAnalyticsPanels({
  alerts,
  platformMix,
  heatmap,
  tenure,
  onSelectDriver,
}: Props) {
  const maxHeat = Math.max(0, ...heatmap.cells.flat());
  // Show every 3rd hour label on mobile density
  const hourTicks = heatmap.hours.filter((h) => h % 3 === 0);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Critical Alerts</CardTitle>
            {alerts.length > 0 && (
              <Badge className="bg-rose-100 text-rose-700 border-0 font-bold">{alerts.length}</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No performance alerts this period.</p>
            ) : (
              alerts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={cn(
                    'w-full text-left rounded-lg border p-3 flex gap-3 min-h-11',
                    a.severity === 'critical'
                      ? 'border-rose-200 bg-rose-50/60'
                      : 'border-amber-200 bg-amber-50/60',
                    a.driverId && onSelectDriver && 'hover:ring-2 hover:ring-indigo-200',
                  )}
                  onClick={() => a.driverId && onSelectDriver?.(a.driverId)}
                >
                  <div
                    className={cn(
                      'p-2 rounded-lg h-fit',
                      a.severity === 'critical' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700',
                    )}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{a.detail}</p>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Platform Mix</CardTitle>
          </CardHeader>
          <CardContent>
            {platformMix.length === 0 ? (
              <p className="text-sm text-slate-400 py-12 text-center">No completed trips to chart.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={platformMix} dataKey="earnings" nameKey="name" innerRadius={50} outerRadius={75}>
                      {platformMix.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatJMD(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {platformMix.map((s) => (
                    <div key={s.name} className="flex items-center gap-2 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="text-slate-600">{s.name}</span>
                      <span className="ml-auto tabular-nums font-semibold">{s.pct}%</span>
                      <span className="text-slate-400 text-xs tabular-nums w-16 text-right">{s.trips} trips</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <CardHeader>
          <CardTitle className="text-lg">Fleet Trip Heatmap</CardTitle>
          <p className="text-xs text-slate-500">Completed trips by weekday × hour (from trip timestamps).</p>
        </CardHeader>
        <CardContent>
          {maxHeat <= 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">No trip timing data for a heatmap.</p>
          ) : (
            <div className="min-w-[520px]">
              <div
                className="grid gap-0.5 mb-1"
                style={{ gridTemplateColumns: `40px repeat(24, minmax(0, 1fr))` }}
              >
                <div />
                {heatmap.hours.map((h) => (
                  <div key={h} className="text-center text-[9px] text-slate-400">
                    {hourTicks.includes(h) ? String(h).padStart(2, '0') : ''}
                  </div>
                ))}
              </div>
              {heatmap.days.map((day, di) => (
                <div
                  key={day}
                  className="grid gap-0.5 mb-0.5"
                  style={{ gridTemplateColumns: `40px repeat(24, minmax(0, 1fr))` }}
                >
                  <div className="text-[10px] font-semibold text-slate-600 self-center">{day}</div>
                  {heatmap.cells[di].map((count, hi) => (
                    <div
                      key={`${di}-${hi}`}
                      title={`${day} ${String(hi).padStart(2, '0')}:00 — ${count} trips`}
                      className={cn('h-5 rounded-sm', heatBg(count, maxHeat))}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {tenure.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Driver Tenure</CardTitle>
            <p className="text-xs text-slate-500">Based on driver created / hire dates on file.</p>
          </CardHeader>
          <CardContent className="min-h-[200px]">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tenure} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={100}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip />
                <Bar dataKey="count" name="Drivers" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
