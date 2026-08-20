/**
 * SupabasePlatformTab.tsx
 *
 * Plan gauges (Usage Summary style) + leak radar + alert thresholds.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
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

function fmtMeter(m: SupabaseUsageMeter): string {
  if (m.used == null || !m.available) return '—';
  if (m.unit === 'gb') return `${m.used < 1 ? m.used.toFixed(3) : m.used.toFixed(2)} GB`;
  if (m.unit === 'hours') return `${m.used.toFixed(0)} h`;
  if (m.key.toLowerCase().includes('users')) return `${fmtNum(Math.round(m.used))} MAU`;
  return fmtNum(Math.round(m.used));
}

function fmtIncluded(m: SupabaseUsageMeter): string {
  if (m.included == null) return 'Unlimited / n/a';
  if (m.unit === 'gb') return `${m.included} GB`;
  if (m.unit === 'hours') return `${fmtNum(m.included)} h`;
  return fmtNum(m.included);
}

function statusTone(status: SupabaseUsageMeter['status']) {
  if (status === 'critical') return 'border-red-500/40 bg-red-500/10';
  if (status === 'warn') return 'border-amber-500/40 bg-amber-500/10';
  if (status === 'unavailable') return 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40';
  return 'border-emerald-500/25 bg-white dark:bg-slate-900/50';
}

function classBadge(c: RadarPathRow['classification']) {
  if (c === 'heavy') return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (c === 'tiny') return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
}

export function SupabasePlatformTab() {
  const [radarRange, setRadarRange] = useState<RadarRange>('24h');
  const { data, isLoading, error } = useSupabasePlatformSummary();
  const { data: radar, isLoading: radarLoading, error: radarError } = useSupabaseRadar(radarRange);
  const syncMut = useSyncSupabaseUsage();
  const saveAlerts = useSaveSupabaseAlerts();

  const [warnPct, setWarnPct] = useState<number | null>(null);
  const [criticalPct, setCriticalPct] = useState<number | null>(null);
  const [spikeMult, setSpikeMult] = useState<number | null>(null);

  const alerts = data?.alerts;
  const effectiveWarn = warnPct ?? alerts?.warnPct ?? 50;
  const effectiveCritical = criticalPct ?? alerts?.criticalPct ?? 80;
  const effectiveSpike = spikeMult ?? alerts?.invocationSpikeMult ?? 5;

  const meters = data?.snapshot?.meters || [];
  const primaryKeys = useMemo(
    () =>
      new Set([
        'egressGb',
        'cachedEgressGb',
        'functionInvocations',
        'storageSizeGb',
        'databaseSizeGb',
        'monthlyActiveUsers',
        'realtimePeakConnections',
        'realtimeMessages',
        'microComputeHours',
        'storageImageTransformations',
        'logDrainEvents',
        'monthlyActiveSsoUsers',
        'monthlyActiveThirdPartyUsers',
      ]),
    [],
  );
  const orderedMeters = useMemo(
    () => [...meters].sort((a, b) => {
      const ai = [...primaryKeys].indexOf(a.key);
      const bi = [...primaryKeys].indexOf(b.key);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }),
    [meters, primaryKeys],
  );

  const orgSlug = data?.snapshot?.orgSlug || data?.plan?.orgSlug || '';
  const usageUrl = orgSlug
    ? `https://supabase.com/dashboard/org/${orgSlug}/usage`
    : 'https://supabase.com/dashboard/org/_/usage';

  const onSync = async () => {
    try {
      await syncMut.mutateAsync(true);
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
              Billable meters vs plan caps, plus leak radar for noisy paths. Plan tier:{' '}
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

      {!data?.configured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Set <code className="text-xs">SUPABASE_PAT</code> and <code className="text-xs">SUPABASE_PROJECT_REF</code> (optional{' '}
          <code className="text-xs">SUPABASE_ORG_SLUG</code>) as edge secrets, then Sync.
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

      {/* Gauges */}
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
          <p className="text-sm text-slate-500">No snapshot yet — click Sync now.</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {orderedMeters.map((m) => (
            <div key={m.key} className={`rounded-xl border px-4 py-3 ${statusTone(m.status)}`}>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{m.label}</div>
              <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{fmtMeter(m)}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                Included: {fmtIncluded(m)}
                {m.pct != null ? ` · ${m.pct.toFixed(0)}%` : ''}
              </div>
              {m.projected != null && m.included != null && (
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Projected month-end:{' '}
                  {m.unit === 'gb'
                    ? `${m.projected.toFixed(2)} GB`
                    : fmtNum(Math.round(m.projected))}
                </div>
              )}
              {m.status === 'unavailable' && (
                <div className="mt-1 text-[11px] text-slate-500">Unavailable from API</div>
              )}
              {m.included != null && m.included > 0 && m.used != null && (
                <div className="relative h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mt-2 overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 ${
                      m.status === 'critical'
                        ? 'bg-red-400'
                        : m.status === 'warn'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(100, m.pct || 0)}%` }}
                  />
                </div>
              )}
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
        <div className="px-3 py-6 text-sm text-slate-500">No data</div>
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
