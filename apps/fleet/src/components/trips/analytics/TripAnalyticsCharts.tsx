import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatJMD } from '../../../utils/formatJMD';
import { DOW_LABELS, type HeatMeasure } from './tripAnalyticsModel';
import { measureLabel } from './TripAnalyticsToolbar';

function TableToggle({ rows, headers }: { rows: (string | number)[][]; headers: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" className="min-h-11 text-sm text-indigo-700" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide table' : 'View as table'}
      </button>
      {open ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr>{headers.map((h) => <th key={h} className="py-1 pr-3 font-medium text-slate-500">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="py-1 pr-3">{cell}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function TripAnalyticsVolume({
  volume,
}: {
  volume?: {
    series?: { bucket: string; completed: number; cancelled: number }[];
    prior?: { bucket: string; completed: number }[];
    byDow?: { dow: number; completed: number; cancelled: number }[];
  };
}) {
  const series = (volume?.series || []).map((row, i) => ({
    ...row,
    label: String(row.bucket).slice(5),
    prior: volume?.prior?.[i]?.completed ?? null,
    moving: movingAverage(volume?.series || [], i),
  }));
  const dow = (volume?.byDow || []).map((row) => ({
    ...row,
    label: DOW_LABELS[(row.dow || 1) - 1] || String(row.dow),
  }));
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">Demand</h3>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-2">
          <p className="mb-2 text-sm text-slate-500">Completed and cancelled trips. Dashed line is the previous period.</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line dataKey="completed" name="Completed" stroke="#4f46e5" dot={false} />
                <Line dataKey="cancelled" name="Cancelled" stroke="#e11d48" dot={false} />
                <Line dataKey="moving" name="7-day average" stroke="#0f172a" dot={false} />
                <Line dataKey="prior" name="Previous period" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <TableToggle headers={['Day', 'Completed', 'Cancelled']} rows={series.map((r) => [r.bucket, r.completed, r.cancelled])} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm text-slate-500">Day of week. Weekends are tinted.</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dow}>
                <CartesianGrid stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="completed" name="Completed">
                  {dow.map((row) => <Cell key={row.label} fill={row.dow >= 6 ? '#c7d2fe' : '#4f46e5'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <TableToggle headers={['Day', 'Completed', 'Cancelled']} rows={dow.map((r) => [r.label, r.completed, r.cancelled])} />
        </div>
      </div>
    </section>
  );
}

function movingAverage(series: { completed: number }[], index: number): number | null {
  const slice = series.slice(Math.max(0, index - 6), index + 1);
  if (!slice.length) return null;
  return slice.reduce((sum, row) => sum + Number(row.completed || 0), 0) / slice.length;
}

export function TripAnalyticsHeatmap({
  heatmap,
  measure,
  onMeasure,
  onPick,
}: {
  heatmap?: { cells?: { dow: number; hour: number; value: number | null }[]; timeKnown?: number; timeUnknown?: number; total?: number };
  measure: HeatMeasure;
  onMeasure: (measure: HeatMeasure) => void;
  onPick: (dow: number, hour: number) => void;
}) {
  const cells = heatmap?.cells || [];
  const max = Math.max(1, ...cells.map((c) => Number(c.value) || 0));
  const lookup = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.value]));
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">Hour and day</h3>
        <div className="flex flex-wrap gap-2">
          {(['completed', 'cancelled', 'surge_share', 'fare_per_km'] as HeatMeasure[]).map((item) => (
            <button key={item} type="button" className={`min-h-11 rounded-lg px-3 text-sm ${measure === item ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`} onClick={() => onMeasure(item)}>
              {measureLabel(item)}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-2 text-sm text-slate-500">
        {heatmap?.timeKnown ?? 0} trips have a time. {heatmap?.timeUnknown ?? 0} are missing a time and are not in this grid.
        {measure === 'surge_share' ? ' Surge share is Uber only.' : ''}
      </p>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid" style={{ gridTemplateColumns: '3.5rem repeat(24, minmax(0, 1fr))' }}>
            <div />
            {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="text-center text-[10px] text-slate-400">{hour}</div>)}
            {DOW_LABELS.map((label, index) => (
              <div key={label} className="contents">
                <div className="sticky left-0 bg-white pr-1 text-xs text-slate-600">{label}</div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const value = lookup.get(`${index + 1}-${hour}`);
                  const strength = value == null ? 0 : Number(value) / max;
                  return (
                    <button
                      key={`${label}-${hour}`}
                      type="button"
                      title={`${label} ${hour}:00 · ${value == null ? 'no data' : value}`}
                      className="m-px h-6 min-h-0 rounded-sm"
                      style={{ background: value == null ? '#f8fafc' : `rgba(79, 70, 229, ${0.12 + strength * 0.88})` }}
                      onClick={() => onPick(index + 1, hour)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Lighter is lower. Darker is higher. Colour is not the only cue: each cell has a value on hover.</p>
        </div>
      </div>
    </section>
  );
}

const ACTOR_COLORS: Record<string, string> = {
  rider: '#4f46e5',
  driver: '#e11d48',
  delivery: '#d97706',
  unknown: '#94a3b8',
  system: '#0f766e',
};

export function TripAnalyticsCancellations({
  data,
  onDriver,
}: {
  data?: {
    byActor?: { actor: string; count: number }[];
    byReason?: { reason: string; count: number }[];
    trend?: { date: string; rate: number | null; spike?: boolean; cancelled: number }[];
    topDrivers?: { driverId: string; driverName?: string; trips: number; cancelled: number; rate: number }[];
    cancelled?: number;
  };
  onDriver: (driverId: string) => void;
}) {
  const actors = data?.byActor || [];
  const reasons = (data?.byReason || []).map((row) => ({ ...row, label: row.reason.replace(/_/g, ' ') }));
  const trend = (data?.trend || []).map((row) => ({ ...row, ratePct: row.rate == null ? null : Number(row.rate) * 100 }));
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-900">Cancellations</h3>
      <p className="text-sm text-slate-500">This chart includes delivery jobs. The rate on the card above does not. There is no estimated lost-fare figure.</p>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={actors} dataKey="count" nameKey="actor" innerRadius={50} outerRadius={80}>
                  {actors.map((row) => <Cell key={row.actor} fill={ACTOR_COLORS[row.actor] || '#64748b'} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="text-sm text-slate-700">
            {actors.map((row) => <li key={row.actor}>{row.actor}: {row.count}</li>)}
          </ul>
          <TableToggle headers={['Who', 'Trips']} rows={actors.map((r) => [r.actor, r.count])} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reasons} layout="vertical">
                <XAxis type="number" />
                <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#4f46e5" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <TableToggle headers={['Reason', 'Trips']} rows={reasons.map((r) => [r.label, r.count])} />
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm text-slate-500">Spikes are days more than two typical jumps above the average rate.</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line dataKey="ratePct" name="Cancel %" stroke="#e11d48" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Spike days: {trend.filter((row) => row.spike).map((row) => row.date).join(', ') || 'none'}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500"><th className="p-3">Driver</th><th>Trips</th><th>Cancelled</th><th>Rate</th></tr></thead>
          <tbody>
            {(data?.topDrivers || []).map((row) => (
              <tr key={row.driverId} className="border-t">
                <td className="p-3">
                  <button type="button" className="min-h-11 text-indigo-700" onClick={() => onDriver(row.driverId)}>{row.driverName || row.driverId}</button>
                </td>
                <td>{row.trips}</td>
                <td>{row.cancelled}</td>
                <td>{row.rate == null ? '—' : `${(Number(row.rate) * 100).toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data?.topDrivers || []).length === 0 ? <p className="p-3 text-sm text-slate-500">No driver has 20 trips in this period yet.</p> : null}
      </div>
    </section>
  );
}

export function TripAnalyticsEconomics({
  data,
}: {
  data?: {
    histogram?: { bin: number; count: number }[];
    p50?: number;
    p99?: number;
    uberComposition?: Record<string, number>;
    uberGap?: number;
    uberGapWithin1Pct?: boolean;
    farePerKmByHour?: { hour: number; platform: string; farePerKm: number }[];
    fees?: { platform: string; gross: number; fee: number; net: number; feePct: number | null }[];
    cashVsDigital?: { platform: string; cash: number; digital: number }[];
  };
}) {
  const hist = data?.histogram || [];
  const parts = data?.uberComposition;
  const stack = parts ? [
    { name: 'Base', value: parts.base },
    { name: 'Surge', value: parts.surge },
    { name: 'Tips', value: parts.tips },
    { name: 'Wait', value: parts.wait },
    { name: 'Airport', value: parts.airport },
    { name: 'Taxes', value: parts.taxes },
    { name: 'Tolls', value: parts.tolls },
  ] : [];
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-900">Trip economics</h3>
      <p className="text-sm text-slate-500">Platform-reported. Uber fare pieces are labelled because InDrive and Roam send zeros.</p>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Median {data?.p50 != null ? formatJMD(Number(data.p50), 2) : '—'} · 99th percentile {data?.p99 != null ? formatJMD(Number(data.p99), 2) : '—'}. Fares above the usual high are listed under Anomalies.</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hist}>
                <XAxis dataKey="bin" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#4f46e5" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <TableToggle headers={['Bin', 'Trips']} rows={hist.map((r) => [r.bin, r.count])} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium">Uber fare composition</p>
          {parts ? (
            <ul className="space-y-1 text-sm">
              {stack.map((row) => <li key={row.name} className="flex justify-between"><span>{row.name}</span><span>{formatJMD(Number(row.value) || 0, 0)}</span></li>)}
            </ul>
          ) : <p className="text-sm text-slate-500">—</p>}
          {data && data.uberGapWithin1Pct === false ? (
            <p className="mt-2 text-sm text-amber-800">These pieces differ from Uber gross by {formatJMD(Math.abs(Number(data.uberGap) || 0), 0)}. The gap is shown so the pieces are not treated as the full fare.</p>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500"><th className="p-3">Platform</th><th>Gross</th><th>Fee</th><th>Net</th><th>Fee %</th></tr></thead>
          <tbody>
            {(data?.fees || []).map((row) => (
              <tr key={row.platform} className="border-t">
                <td className="p-3">{row.platform}</td>
                <td>{formatJMD(Number(row.gross) || 0, 0)}</td>
                <td>{formatJMD(Number(row.fee) || 0, 0)}</td>
                <td>{formatJMD(Number(row.net) || 0, 0)}</td>
                <td>{row.feePct == null ? '—' : `${(Number(row.feePct) * 100).toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p className="mb-2 font-medium">Cash vs digital</p>
        {(data?.cashVsDigital || []).map((row) => (
          <p key={row.platform}>{row.platform}: {row.cash} cash · {row.digital} digital</p>
        ))}
      </div>
    </section>
  );
}
