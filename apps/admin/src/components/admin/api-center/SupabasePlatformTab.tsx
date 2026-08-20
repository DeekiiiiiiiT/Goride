/**
 * SupabasePlatformTab.tsx
 *
 * Usage Summary with circular progress gauges (Supabase-style) + leak radar + alerts.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import {
  useSaveSupabaseAlerts,
  useSupabasePlatformSummary,
  useSupabaseRadar,
  useSyncSupabaseUsage,
  type RadarPathRow,
  type SupabaseUsageMeter,
} from './hooks';
import { fmtNum } from './providers';

type RadarRange = '24h' | '7d';

function fmtUsed(m: SupabaseUsageMeter): string {
  if (m.used == null || !m.available) return '—';
  if (m.unit === 'gb') return m.used < 1 ? m.used.toFixed(3) : m.used.toFixed(2);
  if (m.unit === 'hours') return `${Math.round(m.used)} hours`;
  if (m.key.toLowerCase().includes('users')) return `${fmtNum(Math.round(m.used))} MAU`;
  return fmtNum(Math.round(m.used));
}

function fmtCap(m: SupabaseUsageMeter): string {
  if (m.included == null) return '';
  if (m.unit === 'gb') return `${m.included} GB`;
  if (m.unit === 'hours') return '';
  if (m.key.toLowerCase().includes('users')) return `${fmtNum(m.included)} MAU`;
  return fmtNum(m.included);
}

function fmtRatio(m: SupabaseUsageMeter): string {
  const used = fmtUsed(m);
  const cap = fmtCap(m);
  if (!cap) {
    if (m.unit === 'gb' && m.used != null) return `${used} GB`;
    return used;
  }
  if (m.unit === 'gb') return `${used} / ${cap}`;
  return `${used} / ${cap}`;
}

function pctLabel(m: SupabaseUsageMeter): string {
  if (m.pct == null) return '';
  if (m.pct < 1) return '<1%';
  return `${m.pct.toFixed(0)}%`;
}

function ringColor(status: SupabaseUsageMeter['status']) {
  if (status === 'critical') return '#ef4444';
  if (status === 'warn') return '#f59e0b';
  if (status === 'unavailable') return '#94a3b8';
  return '#14b8a6';
}

/** Circular progress ring — mirrors Supabase Usage Summary. */
function UsageRing({ pct, status }: { pct: number | null; status: SupabaseUsageMeter['status'] }) {
  const size = 44;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, pct ?? 0));
  // Show a tiny visible arc even at <1% so the ring isn't empty like "broken"
  const visual = p > 0 && p < 1.5 ? 1.5 : p;
  const offset = c - (visual / 100) * c;
  const color = ringColor(status);

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-slate-200 dark:text-slate-700"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={pct == null || pct <= 0 ? c : offset}
      />
    </svg>
  );
}

function classBadge(c: RadarPathRow['classification']) {
  if (c === 'heavy') return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (c === 'tiny') return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
}

/** Horizontal bar chart under each meter for “used vs included”. */
function UsageBar({ m }: { m: SupabaseUsageMeter }) {
  const pct = Math.min(100, Math.max(0, m.pct ?? 0));
  const fill =
    m.status === 'critical' ? 'bg-red-500' : m.status === 'warn' ? 'bg-amber-500' : 'bg-teal-500';
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
        <span>Used</span>
        <span>{pctLabel(m) || (m.included == null ? 'n/a' : '0%')}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${fill}`}
          style={{ width: `${m.included == null ? 0 : Math.max(pct > 0 ? pct : 0, pct > 0 && pct < 1 ? 2 : pct)}%` }}
        />
      </div>
    </div>
  );
}

export function SupabasePlatformTab() {
  const [radarRange, setRadarRange] = useState<RadarRange>('24h');
  const { data, isLoading, error, refetch } = useSupabasePlatformSummary();
  const { data: radar, isLoading: radarLoading, error: radarError } = useSupabaseRadar(radarRange);
  const syncMut = useSyncSupabaseUsage();
  const saveAlerts = useSaveSupabaseAlerts();
  const [syncOk, setSyncOk] = useState<string | null>(null);

  const [warnPct, setWarnPct] = useState<number | null>(null);
  const [criticalPct, setCriticalPct] = useState<number | null>(null);
  const [spikeMult, setSpikeMult] = useState<number | null>(null);

  const alerts = data?.alerts;
  const effectiveWarn = warnPct ?? alerts?.warnPct ?? 50;
  const effectiveCritical = criticalPct ?? alerts?.criticalPct ?? 80;
  const effectiveSpike = spikeMult ?? alerts?.invocationSpikeMult ?? 5;

  const meters = data?.snapshot?.meters || [];
  const primaryKeys = useMemo(
    () => [
      'realtimePeakConnections',
      'functionInvocations',
      'storageSizeGb',
      'egressGb',
      'monthlyActiveUsers',
      'cachedEgressGb',
      'monthlyActiveSsoUsers',
      'monthlyActiveThirdPartyUsers',
      'storageImageTransformations',
      'realtimeMessages',
      'logDrainEvents',
      'microComputeHours',
      'databaseSizeGb',
    ],
    [],
  );
  const orderedMeters = useMemo(
    () =>
      [...meters].sort((a, b) => {
        const ai = primaryKeys.indexOf(a.key);
        const bi = primaryKeys.indexOf(b.key);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }),
    [meters, primaryKeys],
  );

  const orgSlug = data?.snapshot?.orgSlug || data?.plan?.orgSlug || '';
  const usageUrl = orgSlug
    ? `https://supabase.com/dashboard/org/${orgSlug}/usage`
    : 'https://supabase.com/dashboard/org/_/usage';

  const onSync = async () => {
    setSyncOk(null);
    try {
      const result = await syncMut.mutateAsync(true);
      if (result?.ok === false) {
        throw new Error(result.detail || result.reason || 'Sync failed');
      }
      setSyncOk(result?.reason === 'rate-limited' ? 'Already synced recently — showing cached meters.' : 'Synced. Gauges updated.');
      await refetch();
    } catch {
      /* surfaced via syncMut.error */
    }
  };

  const onSaveAlerts = async () => {
    try {
      await saveAlerts.mutateAsync({
        warnPct: effectiveWarn,
        criticalPct: effectiveCritical,
        invocationSpikeMult: effectiveSpike,
      });
      setWarnPct(null);
      setCriticalPct(null);
      setSpikeMult(null);
    } catch {
      /* surfaced via saveAlerts.error */
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-teal-500/10 p-2 rounded-lg">
            <Database className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Supabase Platform</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Same meters as Supabase Usage Summary. Plan:{' '}
              <span className="text-amber-300 font-medium uppercase">{data?.plan?.tier || 'pro'}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={usageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Open Supabase Usage <ExternalLink className="w-3 h-3" />
          </a>
          <button
            type="button"
            onClick={onSync}
            disabled={syncMut.isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs rounded-lg hover:bg-amber-500/25 disabled:opacity-50"
          >
            {syncMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sync now
          </button>
        </div>
      </div>

      {(error || syncMut.error || saveAlerts.error) && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {(error as Error)?.message ||
              (syncMut.error as Error)?.message ||
              (saveAlerts.error as Error)?.message}
          </span>
        </div>
      )}

      {syncOk && (
        <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg px-4 py-3 text-sm">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{syncOk}</span>
        </div>
      )}

      {!data?.configured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Set <code className="text-xs">ROAM_MGMT_PAT</code> (optional{' '}
          <code className="text-xs">ROAM_ORG_SLUG</code> / <code className="text-xs">ROAM_PROJECT_REF</code>) as edge secrets, then Sync.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>
          Last synced:{' '}
          <span className="text-slate-300">
            {data?.snapshot?.syncedAt ? new Date(data.snapshot.syncedAt).toLocaleString() : 'Never'}
          </span>
        </span>
        {data?.snapshot?.alertStatus === 'ok' && (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Within alert thresholds
          </span>
        )}
        {data?.snapshot?.alertStatus === 'warn' && (
          <span className="inline-flex items-center gap-1 text-amber-300">
            <TriangleAlert className="w-3.5 h-3.5" /> Warning
          </span>
        )}
        {data?.snapshot?.alertStatus === 'critical' && (
          <span className="inline-flex items-center gap-1 text-red-300">
            <TriangleAlert className="w-3.5 h-3.5" /> Critical
          </span>
        )}
      </div>

      {data?.snapshot?.alertMessages?.length ? (
        <ul className="text-xs text-amber-200/90 list-disc pl-5 space-y-1">
          {data.snapshot.alertMessages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}

      {/* Gauges — Supabase Usage Summary layout */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 pb-2">
          Usage Summary
        </h3>
        {isLoading && (
          <div className="flex justify-center py-16 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
        {!isLoading && orderedMeters.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 px-6 py-10 text-center space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">No usage data yet — this page stays blank until the first sync.</p>
            <p className="text-xs text-slate-500">Click Sync now (top right). After that you’ll see circular gauges + bars for every meter.</p>
            <button
              type="button"
              onClick={onSync}
              disabled={syncMut.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-200 border border-amber-500/40 text-sm rounded-lg hover:bg-amber-500/30 disabled:opacity-50"
            >
              {syncMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sync now
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {orderedMeters.map((m) => (
            <div
              key={m.key}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col dark:border-slate-800 dark:bg-slate-900/50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                    <span className="truncate">{m.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                    {fmtRatio(m)}
                    {pctLabel(m) ? (
                      <span className="text-slate-500"> ({pctLabel(m)})</span>
                    ) : null}
                  </div>
                  {m.projected != null && m.included != null && (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      Projected month-end:{' '}
                      {m.unit === 'gb'
                        ? `${m.projected.toFixed(2)} GB`
                        : fmtNum(Math.round(m.projected))}
                    </div>
                  )}
                </div>
                <UsageRing pct={m.pct} status={m.status} />
              </div>
              <UsageBar m={m} />
            </div>
          ))}
        </div>
      </section>

      {/* Leak radar */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Leak radar</h3>
          <div className="flex items-center gap-1">
            {(['24h', '7d'] as RadarRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRadarRange(r)}
                className={`px-3 py-1 rounded-lg text-xs border ${
                  radarRange === r
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'border-slate-200 text-slate-500 dark:border-slate-800'
                }`}
              >
                {r === '24h' ? 'Last 24h' : 'Last 7d'}
              </button>
            ))}
          </div>
        </div>
        {radarError && (
          <div className="text-sm text-red-300">{(radarError as Error).message}</div>
        )}
        {radar?.notes?.length ? (
          <ul className="text-xs text-amber-200/80 list-disc pl-5">
            {radar.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
        {radarLoading ? (
          <div className="flex justify-center py-10 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RadarTable title="Top REST paths" rows={radar?.rest || []} />
            <RadarTable title="Top Edge Function paths" rows={radar?.functions || []} />
          </div>
        )}
      </section>

      {/* Alerts */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 pb-2">
          Alert thresholds
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-slate-500 space-y-1">
            <span>Warn %</span>
            <input
              type="number"
              min={1}
              max={99}
              value={effectiveWarn}
              onChange={(e) => setWarnPct(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-500 space-y-1">
            <span>Critical %</span>
            <input
              type="number"
              min={2}
              max={100}
              value={effectiveCritical}
              onChange={(e) => setCriticalPct(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-500 space-y-1">
            <span>Path spike multiplier</span>
            <input
              type="number"
              min={1}
              step={0.5}
              value={effectiveSpike}
              onChange={(e) => setSpikeMult(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onSaveAlerts}
          disabled={saveAlerts.isPending}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs rounded-lg hover:bg-amber-500/25 disabled:opacity-50"
        >
          {saveAlerts.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Save thresholds
        </button>
      </section>
    </div>
  );
}

function RadarTable({ title, rows }: { title: string; rows: RadarPathRow[] }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-6 text-sm text-slate-500">No data yet — sync first, then refresh this range.</div>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800 max-h-80 overflow-auto">
          {rows.map((r) => (
            <li key={r.path} className="px-3 py-2 flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="font-mono text-slate-700 dark:text-slate-200 truncate" title={r.path}>
                  {r.path}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className={`px-1.5 py-0.5 rounded border ${classBadge(r.classification)}`}>
                    {r.classification}
                  </span>
                  {r.spike && (
                    <span className="px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-300 bg-amber-500/10">
                      spike
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold text-slate-900 dark:text-white">{fmtNum(r.requests)}</div>
                <div className="text-[10px] text-slate-500">prior {fmtNum(r.priorRequests)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
