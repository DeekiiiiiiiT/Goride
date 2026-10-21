import React, { useMemo, useState } from 'react';
import {
  Check,
  FileSpreadsheet,
  Fuel,
  Loader2,
  MapPin,
  Minus,
  Receipt,
  Truck,
  Wallet,
} from 'lucide-react';
import { RECON_SOURCES, weekDayKeys, type ReconSourceId } from '@roam/finance-core';
import type { ReconWeekSource, ReconWeekSummary } from '../../../services/reconApi';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { cn } from '../../ui/utils';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Short landing labels — full names stay on the Sources step. */
const SOURCE_SHORT_LABEL: Record<string, string> = {
  uber_bundle: 'Uber',
  indrive_trips: 'InDrive',
  roam_trips: 'Roam trips',
  toll_usage: 'Toll usage',
  toll_topup: 'Top-ups',
  cash_tolls: 'Cash tolls',
  fuel_card_roam: 'Roam fuel',
  fuel_card_self: 'Own fuel',
  cash_fuel: 'Cash fuel',
  rush_deliveries: 'Deliveries',
  cod_remittance: 'COD',
};

const SOURCE_DEF_BY_ID = Object.fromEntries(RECON_SOURCES.map((s) => [s.id, s]));

/** Manifest optional sources — never scream amber “Needed” when empty. */
const OPTIONAL_SOURCE_IDS = new Set<string>(
  RECON_SOURCES.filter((s) => {
    // Static optional ids from requiredWhen shape (profile-independent optionals).
    return (
      s.id === 'roam_trips' ||
      s.id === 'cash_tolls' ||
      s.id === 'cash_fuel' ||
      s.id === 'cod_remittance'
    );
  }).map((s) => s.id),
);

/** Plain-English “what to do” for the landing overlay. */
const SOURCE_WHAT_TO_DO: Record<string, string> = {
  uber_bundle: 'Upload the Uber weekly reports (or bundle) that cover this Monday–Sunday week.',
  indrive_trips: 'Upload the InDrive trip export whose date range covers this week.',
  roam_trips:
    'Optional — we read Roam trips automatically. Open the week only if something looks missing.',
  toll_usage: 'Upload the tag usage / toll statement CSV for this week, then finish the Tolls step.',
  toll_topup: 'Upload the tag top-up statement that covers this week.',
  cash_tolls: 'Optional — review driver cash tolls in the week wizard, or skip if you do not use them.',
  fuel_card_roam:
    'Upload or match the Roam Fuels / Gas Card statement for this week (card fills in Transaction Logs count once they land).',
  fuel_card_self: 'Upload the own / self-serve fuel card statement that covers this Monday–Sunday week.',
  cash_fuel: 'Optional — review cash fuel receipts in the week’s Fuel step when you track them.',
  rush_deliveries:
    'Open the Delivery week once readiness is green; we pull deliveries from the platform.',
  cod_remittance:
    'Optional — remittance detail lives in courier settlements; shown here for awareness.',
};

function sourceShortLabel(id: string): string {
  return SOURCE_SHORT_LABEL[id] ?? SOURCE_DEF_BY_ID[id]?.label ?? id;
}

function sourceWhatToDo(id: string): string {
  return (
    SOURCE_WHAT_TO_DO[id] ?? 'Open the week and complete the Sources step to provide or review it.'
  );
}

function SourceIcon({ id }: { id: string }) {
  const cls = 'h-3.5 w-3.5';
  switch (id as ReconSourceId) {
    case 'uber_bundle':
    case 'indrive_trips':
    case 'roam_trips':
    case 'rush_deliveries':
      return <Truck className={cls} aria-hidden />;
    case 'toll_usage':
    case 'toll_topup':
    case 'cash_tolls':
      return <MapPin className={cls} aria-hidden />;
    case 'fuel_card_roam':
    case 'fuel_card_self':
    case 'cash_fuel':
      return <Fuel className={cls} aria-hidden />;
    case 'cod_remittance':
      return <Wallet className={cls} aria-hidden />;
    default:
      return <FileSpreadsheet className={cls} aria-hidden />;
  }
}

type SourceTone = 'done' | 'needs' | 'muted';

function isOptionalSource(id: string): boolean {
  return OPTIONAL_SOURCE_IDS.has(id);
}

function sourceTone(status: string, sourceId: string): SourceTone {
  const s = String(status || '').toLowerCase();
  if (s === 'received' || s === 'attested_none') return 'done';
  if (s === 'not_applicable' || s === 'waived') return 'muted';
  // Optional + empty: quiet “Optional”, not amber Needed.
  if (isOptionalSource(sourceId) && (s === 'missing' || s === 'partial')) return 'muted';
  return 'needs';
}

function sourceStatusText(status: string, sourceId: string): string {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'received':
      return 'Done';
    case 'attested_none':
      return 'None attested';
    case 'waived':
      return 'Waived';
    case 'partial':
      return isOptionalSource(sourceId) ? 'Optional' : 'Partial';
    case 'waiting_external':
      return 'Waiting';
    case 'missing':
      return isOptionalSource(sourceId) ? 'Optional' : 'Needed';
    case 'not_applicable':
      return 'N/A';
    default:
      return status || '—';
  }
}

/** Mon→Sun day coverage with weekday labels (was unlabeled dots). */
function CoverageStrip({
  weekKey,
  coverage,
}: {
  weekKey: string;
  coverage: Record<string, string>;
}) {
  const keys = weekDayKeys(weekKey);
  return (
    <div
      className="flex gap-1"
      role="group"
      aria-label="Mon to Sun source coverage"
      title="Mon → Sun coverage across sources"
    >
      {keys.map((d, i) => {
        const v = coverage[d] ?? 'missing';
        const ok = v === 'covered' || v === 'zero_attested';
        return (
          <div key={d} className="flex w-7 flex-col items-center gap-0.5">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-sm border',
                ok ? 'border-emerald-400 bg-emerald-400' : 'border-slate-200 bg-slate-100',
              )}
              aria-hidden
            />
            <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
              {DAY_LABELS[i]}
            </span>
          </div>
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

/** Labeled source cell — same pattern as fuel StepStatusCell. */
function SourceStatusCell({
  source,
  onOpen,
}: {
  source: ReconWeekSource;
  onOpen: () => void;
}) {
  const label = sourceShortLabel(source.id);
  const tone = sourceTone(source.status, source.id);
  const statusText = sourceStatusText(source.status, source.id);
  const isDone = tone === 'done';
  const isMuted = tone === 'muted';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={cn(
        'flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
        'hover:ring-2 hover:ring-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1',
        isMuted && 'border-slate-200 bg-slate-50',
        isDone && 'border-emerald-100 bg-emerald-50/60',
        !isDone && !isMuted && 'border-amber-200 bg-amber-50',
      )}
      aria-label={`${label}: ${statusText}. Explain this source.`}
    >
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white',
          isMuted && 'bg-slate-400',
          isDone && 'bg-emerald-500',
          !isDone && !isMuted && 'bg-amber-500',
        )}
        aria-hidden
      >
        {isDone ? (
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        ) : isMuted ? (
          <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
        ) : (
          <SourceIcon id={source.id} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-xs font-semibold leading-tight',
            isMuted && 'text-slate-600',
            isDone && 'text-emerald-800',
            !isDone && !isMuted && 'text-amber-900',
          )}
        >
          {label}
        </div>
        <div
          className={cn(
            'truncate text-[10px] leading-tight',
            isMuted && 'text-slate-500',
            isDone && 'text-emerald-700/80',
            !isDone && !isMuted && 'text-amber-800/90',
          )}
        >
          {statusText}
        </div>
      </div>
    </button>
  );
}

function sourcesForLanding(week: ReconWeekSummary): ReconWeekSource[] {
  // Hide N/A so the strip matches what ops still need to deal with.
  return week.sources.filter((s) => String(s.status).toLowerCase() !== 'not_applicable');
}

type SourceExplainTarget = {
  weekKey: string;
  source: ReconWeekSource;
};

export function ReconWeekLanding({
  weeks,
  loading,
  onOpenWeek,
  kpis,
  deskLine = 'rideshare',
}: {
  weeks: ReconWeekSummary[];
  loading?: boolean;
  onOpenWeek: (weekKey: string) => void;
  kpis: { openWeeks: number; needsData: number; oldestLabel: string; oldestAction: string };
  deskLine?: 'rideshare' | 'rush_delivery';
}) {
  const rows = useMemo(() => weeks.slice(0, 12), [weeks]);
  const groups = useMemo(() => {
    const bucket = (week: (typeof rows)[number]) => {
      if (week.state === 'closed') return 'completed' as const;
      if (week.blockers > 0 || week.state === 'collecting') return 'outstanding' as const;
      return 'in_progress' as const;
    };
    return [
      { id: 'outstanding', title: 'Outstanding', hint: 'A required file is still missing', items: rows.filter((w) => bucket(w) === 'outstanding') },
      { id: 'in_progress', title: 'In progress', hint: 'Files are in. The week is not closed.', items: rows.filter((w) => bucket(w) === 'in_progress') },
      { id: 'completed', title: 'Completed', hint: 'This week is closed.', items: rows.filter((w) => bucket(w) === 'completed') },
    ].filter((g) => g.items.length > 0);
  }, [rows]);
  const [explain, setExplain] = useState<SourceExplainTarget | null>(null);

  const explainOpen = explain !== null;
  const explainHow = explain ? sourceWhatToDo(explain.source.id) : '';
  const explainLabel = explain ? sourceShortLabel(explain.source.id) : '';

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading weeks…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-800">
          {deskLine === 'rush_delivery'
            ? 'No delivery weeks to reconcile'
            : 'No rideshare weeks to reconcile'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {deskLine === 'rush_delivery'
            ? 'Weeks appear here only after completed Rush deliveries land in Fleet for that Monday–Sunday week.'
            : 'Weeks appear here only after rideshare trips or Uber/InDrive imports land for that Monday–Sunday week. Blank periods with no activity stay hidden.'}
        </p>
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

      {groups.map((group) => (
        <section key={group.id} className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{group.title}</h2>
            <p className="text-xs text-slate-500">{group.hint}</p>
          </div>
      <ul className="space-y-3">
        {group.items.map((week) => {
          const sources = sourcesForLanding(week);
          return (
            <li
              key={week.weekKey}
              className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-indigo-200 hover:shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <button
                    type="button"
                    className="text-left text-sm font-semibold text-indigo-700 hover:underline"
                    onClick={() => onOpenWeek(week.weekKey)}
                  >
                    Week of {week.weekKey}
                  </button>
                  <CoverageStrip weekKey={week.weekKey} coverage={mergedCoverage(week)} />
                </div>
                <p className="max-w-xs text-right text-xs font-medium text-slate-600">
                  {week.nextAction?.label ?? '—'}
                </p>
              </div>

              {sources.length > 0 ? (
                <div
                  className="mt-3 grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                  role="group"
                  aria-label={`Sources for week of ${week.weekKey}`}
                >
                  {sources.map((source) => (
                    <SourceStatusCell
                      key={source.id}
                      source={source}
                      onOpen={() => setExplain({ weekKey: week.weekKey, source })}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                  <Receipt className="h-3.5 w-3.5" aria-hidden />
                  No applicable sources for this week
                </p>
              )}
            </li>
          );
        })}
      </ul>
        </section>
      ))}

      <Dialog
        open={explainOpen}
        onOpenChange={(open) => {
          if (!open) setExplain(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">{explainLabel}</DialogTitle>
            <DialogDescription className="text-sm text-slate-700">
              {explainHow || `What to do for ${explainLabel}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setExplain(null)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                const weekKey = explain?.weekKey;
                setExplain(null);
                if (weekKey) onOpenWeek(weekKey);
              }}
            >
              Open this week
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
