/**
 * OverviewTab.tsx
 *
 * Top-level dashboard. Shows one card per provider: today / MTD counts, error
 * rate, estimated cost, budget utilization bar, and a kill-switch toggle.
 *
 * Design: dark, minimal, matches AdminPortal conventions.
 */

import React, { useMemo, useState } from 'react';
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Ban,
  CheckCircle2,
  ShieldOff,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useApiSummary,
  useKillswitches,
  useSaveKillswitch,
  type ProviderSummary,
} from './hooks';
import { PROVIDER_META, PROVIDER_ORDER, fmtNum, fmtUSD } from './providers';

type Range = 'today' | '7d' | '30d' | 'mtd';

export function OverviewTab({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [range, setRange] = useState<Range>('mtd');
  const { data, isLoading, error } = useApiSummary(range);
  const { data: kills } = useKillswitches();
  const qc = useQueryClient();

  const byProvider = useMemo(() => {
    const map = new Map<string, ProviderSummary>();
    (data || []).forEach((d) => map.set(d.provider, d));
    return map;
  }, [data]);

  const totalCost = useMemo(() => (data || []).reduce((s, p) => s + (p.range.costUSD || 0), 0), [data]);
  const totalCalls = useMemo(() => (data || []).reduce((s, p) => s + (p.range.calls || 0), 0), [data]);
  const totalErrors = useMemo(() => (data || []).reduce((s, p) => s + (p.range.errors || 0), 0), [data]);
  const errRate = totalCalls > 0 ? (totalErrors / totalCalls) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* Range selector + totals */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          {(['today', '7d', 'mtd', '30d'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border
                ${range === r
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'}
              `}
            >
              {r === 'today' ? 'Today' : r === '7d' ? 'Last 7 days' : r === 'mtd' ? 'Month to date' : 'Last 30 days'}
            </button>
          ))}
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['api-center'] })}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900/40 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{(error as Error).message}</span>
        </div>
      )}

      {/* Totals strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Estimated spend" value={fmtUSD(totalCost)} tint="amber" />
        <StatCard label="API calls" value={fmtNum(totalCalls)} tint="sky" />
        <StatCard label="Errors" value={fmtNum(totalErrors)} tint={totalErrors > 0 ? 'red' : 'slate'} />
        <StatCard label="Error rate" value={`${errRate.toFixed(2)}%`} tint={errRate > 5 ? 'red' : 'emerald'} />
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {isLoading && (
          <div className="col-span-full flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
        {!isLoading && PROVIDER_ORDER.map((p) => {
          const row = byProvider.get(p);
          const ks = (kills || []).find((k) => k.provider === p);
          return (
            <ProviderCard
              key={p}
              provider={p}
              summary={row}
              killDisabled={!!ks?.disabled}
              onNavigate={onNavigate}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatCard({ label, value, tint }: { label: string; value: string; tint: 'amber' | 'sky' | 'red' | 'emerald' | 'slate' }) {
  const ring =
    tint === 'amber'   ? 'border-amber-500/20' :
    tint === 'sky'     ? 'border-sky-500/20' :
    tint === 'red'     ? 'border-red-500/30' :
    tint === 'emerald' ? 'border-emerald-500/20' :
                         'border-slate-800';
  const color =
    tint === 'amber'   ? 'text-amber-300' :
    tint === 'sky'     ? 'text-sky-300' :
    tint === 'red'     ? 'text-red-300' :
    tint === 'emerald' ? 'text-emerald-300' :
                         'text-slate-300';
  return (
    <div className={`bg-slate-900/40 border rounded-xl px-4 py-3 ${ring}`}>
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function ProviderCard({
  provider,
  summary,
  killDisabled,
  onNavigate,
}: {
  provider: 'openai' | 'gemini' | 'google_maps' | 'supabase' | 'uber';
  summary: ProviderSummary | undefined;
  killDisabled: boolean;
  onNavigate?: (page: string) => void;
}) {
  const meta = PROVIDER_META[provider];
  const Icon = meta.icon;
  const saveKS = useSaveKillswitch();
  const callsToday = summary?.today.calls || 0;
  const callsMonth = summary?.month.calls || 0;
  const costMonth = summary?.month.costUSD || 0;
  const errors = summary?.range.errors || 0;
  const calls = summary?.range.calls || 0;
  const errRate = calls > 0 ? (errors / calls) * 100 : 0;

  const budgetPct = summary?.budget?.monthlyUtilization ?? 0;
  const budgetLimit = summary?.budget?.monthlyBudgetUSD ?? 0;
  const hardStop = !!summary?.budget?.hardStop;

  const barColor = budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className={`bg-slate-900/40 border rounded-xl overflow-hidden ${killDisabled ? 'border-red-500/30' : 'border-slate-800'}`}>
      <div className="flex items-start justify-between px-4 pt-4">
        <div className="flex items-start gap-3">
          <div className="bg-slate-800/80 p-2 rounded-lg">
            <Icon className={`w-4 h-4 ${meta.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">{meta.label}</h3>
              {killDisabled && (
                <span className="text-[10px] uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded font-semibold">
                  Disabled
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">{meta.description}</p>
          </div>
        </div>
        <button
          title={killDisabled ? 'Re-enable provider' : 'Kill-switch (disable provider)'}
          onClick={() => {
            if (killDisabled) {
              saveKS.mutate({ provider, disabled: false, reason: '' });
            } else {
              const reason = typeof window !== 'undefined' ? window.prompt('Reason for disabling (optional):') || '' : '';
              saveKS.mutate({ provider, disabled: true, reason });
            }
          }}
          disabled={saveKS.isPending}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors
            ${killDisabled
              ? 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20'
              : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'}
          `}
        >
          {killDisabled ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {killDisabled ? 'Disabled' : 'Enabled'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 px-4 pt-4">
        <Metric label="Today" value={fmtNum(callsToday)} />
        <Metric label="MTD" value={fmtNum(callsMonth)} />
        <Metric label="Errors" value={`${errRate.toFixed(1)}%`} tone={errRate > 5 ? 'red' : 'slate'} />
        <Metric label="MTD cost" value={fmtUSD(costMonth)} tone="amber" />
      </div>

      {/* Budget bar */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Monthly budget</span>
          <span>
            {budgetLimit > 0
              ? `${fmtUSD(costMonth)} / ${fmtUSD(budgetLimit)} (${budgetPct.toFixed(0)}%)`
              : 'No cap set'}
          </span>
        </div>
        <div className="relative h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
          <div className={`absolute inset-y-0 left-0 ${barColor}`} style={{ width: `${Math.min(100, budgetPct)}%` }} />
        </div>
        {hardStop && budgetPct >= 100 && (
          <div className="flex items-center gap-1.5 text-[11px] text-red-300 mt-1.5">
            <Ban className="w-3 h-3" /> Hard-stop active — calls currently blocked.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3 mt-3 border-t border-slate-800 bg-slate-900/60">
        <button
          onClick={() => onNavigate?.('api-center-usage')}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-amber-300 transition-colors"
        >
          View usage <ArrowUpRight className="w-3 h-3" />
        </button>
        <button
          onClick={() => onNavigate?.('api-center-budgets')}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-amber-300 transition-colors"
        >
          Edit budget <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'amber' | 'red' | 'slate' }) {
  const color = tone === 'amber' ? 'text-amber-300' : tone === 'red' ? 'text-red-300' : 'text-white';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
