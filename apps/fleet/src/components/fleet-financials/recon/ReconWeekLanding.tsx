import React from 'react';
import { Loader2 } from 'lucide-react';
import { weekDayKeys } from '@roam/finance-core';
import type { ReconWeekSummary } from '../../../services/reconApi';
import { cn } from '../../ui/utils';

function CoverageStrip({
  weekKey,
  coverage,
}: {
  weekKey: string;
  coverage: Record<string, string>;
}) {
  const keys = weekDayKeys(weekKey);
  return (
    <div className="flex gap-0.5" title="Mon → Sun coverage">
      {keys.map((d) => {
        const v = coverage[d] ?? 'missing';
        const ok = v === 'covered' || v === 'zero_attested';
        return (
          <span
            key={d}
            className={cn(
              'h-3 w-3 rounded-sm border',
              ok ? 'border-emerald-400 bg-emerald-400' : 'border-slate-200 bg-slate-100',
            )}
          />
        );
      })}
    </div>
  );
}

function mergedCoverage(week: ReconWeekSummary): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of week.sources) {
    for (const [day, status] of Object.entries(s.coverage ?? {})) {
      if (status === 'missing' && out[day] !== 'missing') continue;
      if (!out[day] || status === 'missing') out[day] = status;
    }
  }
  if (Object.keys(out).length === 0 && week.weekKey) {
    for (const d of weekDayKeys(week.weekKey)) out[d] = 'missing';
  }
  return out;
}

export function ReconWeekLanding({
  weeks,
  loading,
  onOpenWeek,
  kpis,
}: {
  weeks: ReconWeekSummary[];
  loading?: boolean;
  onOpenWeek: (weekKey: string) => void;
  kpis: { openWeeks: number; needsData: number; oldestLabel: string; oldestAction: string };
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading weeks…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Open weeks</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{kpis.openWeeks}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Needs data</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{kpis.needsData}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Oldest gap</p>
          <p className="text-sm font-semibold text-slate-900">{kpis.oldestLabel || '—'}</p>
          {kpis.oldestAction ? <p className="text-xs text-slate-500">{kpis.oldestAction}</p> : null}
        </div>
      </section>

      <ul className="divide-y rounded-xl border border-slate-200 bg-white">
        {weeks.slice(0, 12).map((week) => (
          <li
            key={week.weekKey}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0 space-y-1">
              <button
                type="button"
                className="text-left text-sm font-semibold text-indigo-700 hover:underline"
                onClick={() => onOpenWeek(week.weekKey)}
              >
                Week of {week.weekKey}
              </button>
              <CoverageStrip weekKey={week.weekKey} coverage={mergedCoverage(week)} />
            </div>
            <p className="max-w-xs text-right text-xs text-slate-600">
              {week.nextAction?.label ?? '—'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
