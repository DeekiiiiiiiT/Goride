/**
 * UsageTab.tsx
 *
 * Time-series breakdown for a chosen provider. Two inline SVG charts (calls
 * and cost per day) + a top-routes table. We intentionally avoid a charting
 * dependency to keep bundle size flat.
 */

import React, { useMemo, useState } from 'react';
import { Loader2, AlertCircle, Download } from 'lucide-react';
import { useApiUsage } from './hooks';
import type { Provider, UsagePoint } from './hooks';
import { PROVIDER_META, PROVIDER_ORDER, fmtNum, fmtUSD } from './providers';

type Range = '7d' | '30d' | 'mtd';

export function UsageTab() {
  const [provider, setProvider] = useState<Provider>('openai');
  const [range, setRange] = useState<Range>('30d');
  const { data, isLoading, error } = useApiUsage(provider, range);

  const series = data?.series || [];
  const topRoutes = data?.topRoutes || [];

  const totals = useMemo(() => {
    return series.reduce(
      (acc, p) => {
        acc.calls += p.calls;
        acc.cost += p.costUSD;
        acc.errors += p.errors;
        return acc;
      },
      { calls: 0, cost: 0, errors: 0 }
    );
  }, [series]);

  const downloadCsv = () => {
    const header = ['date', 'calls', 'errors', 'costUSD', 'inputTokens', 'outputTokens', 'requests'];
    const rows = series.map((s) => [s.date, s.calls, s.errors, s.costUSD.toFixed(4), s.inputTokens, s.outputTokens, s.requests]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-usage-${provider}-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="bg-slate-900/60 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500/50"
          >
            {PROVIDER_ORDER.map((p) => (
              <option key={p} value={p}>{PROVIDER_META[p].label}</option>
            ))}
          </select>
          {(['7d', 'mtd', '30d'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                ${range === r
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'}
              `}
            >
              {r === '7d' ? 'Last 7 days' : r === 'mtd' ? 'Month to date' : 'Last 30 days'}
            </button>
          ))}
        </div>
        <button
          onClick={downloadCsv}
          disabled={series.length === 0}
          className="inline-flex items-center gap-2 bg-slate-900/40 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{(error as Error).message}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <StatBlock label="Calls" value={fmtNum(totals.calls)} />
            <StatBlock label="Errors" value={fmtNum(totals.errors)} tone={totals.errors > 0 ? 'red' : 'slate'} />
            <StatBlock label="Estimated spend" value={fmtUSD(totals.cost)} tone="amber" />
          </div>

          <ChartCard title="Calls per day" color="sky">
            <SparklineSvg series={series} accessor={(p) => p.calls} stroke="#38bdf8" />
          </ChartCard>

          <ChartCard title="Estimated cost per day (USD)" color="amber">
            <SparklineSvg series={series} accessor={(p) => p.costUSD} stroke="#f59e0b" formatY={(v) => `$${v.toFixed(2)}`} />
          </ChartCard>

          <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-white">Top routes (last 24h)</h3>
            </header>
            <div className="divide-y divide-slate-800">
              {topRoutes.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-slate-500">No calls yet in this window.</div>
              )}
              {topRoutes.map((r) => (
                <div key={r.route} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <span className="font-mono text-slate-300 truncate">{r.route}</span>
                  <div className="flex items-center gap-6 text-[12px] text-slate-400 shrink-0 ml-3">
                    <span>{fmtNum(r.calls)} calls</span>
                    <span className="text-amber-300">{fmtUSD(r.costUSD)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatBlock({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'amber' | 'red' | 'slate' }) {
  const color = tone === 'amber' ? 'text-amber-300' : tone === 'red' ? 'text-red-300' : 'text-white';
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function ChartCard({ title, color, children }: { title: string; color: 'sky' | 'amber'; children: React.ReactNode }) {
  const dot = color === 'sky' ? 'bg-sky-500/60' : 'bg-amber-500/60';
  return (
    <section className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SparklineSvg({
  series,
  accessor,
  stroke,
  formatY,
}: {
  series: UsagePoint[];
  accessor: (p: UsagePoint) => number;
  stroke: string;
  formatY?: (v: number) => string;
}) {
  if (series.length === 0) return <div className="h-32 flex items-center justify-center text-xs text-slate-500">No data</div>;

  const width = 600;
  const height = 140;
  const padding = 28;
  const values = series.map(accessor);
  const max = Math.max(1, ...values);
  const stepX = (width - padding * 2) / Math.max(1, series.length - 1);

  const points = values.map((v, i) => {
    const x = padding + i * stepX;
    const y = height - padding - (v / max) * (height - padding * 2);
    return `${x},${y}`;
  });
  const path = `M ${points.join(' L ')}`;
  const area = `${path} L ${padding + (series.length - 1) * stepX},${height - padding} L ${padding},${height - padding} Z`;

  // X labels: first, middle, last
  const labels = [0, Math.floor(series.length / 2), series.length - 1]
    .filter((i, idx, arr) => arr.indexOf(i) === idx && i < series.length);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-36">
      <defs>
        <linearGradient id={`grad-${stroke}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${stroke})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* Y-axis labels */}
      <text x={4} y={padding + 4} fill="#64748b" fontSize="10">{formatY ? formatY(max) : fmtNum(max)}</text>
      <text x={4} y={height - padding + 4} fill="#64748b" fontSize="10">0</text>
      {/* X-axis labels */}
      {labels.map((i) => {
        const x = padding + i * stepX;
        return (
          <text key={i} x={x} y={height - 6} fill="#64748b" fontSize="10" textAnchor="middle">
            {series[i].date.slice(5)}
          </text>
        );
      })}
    </svg>
  );
}
