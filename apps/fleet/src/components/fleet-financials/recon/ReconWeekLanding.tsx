/**
 * Week Reconciliation — week list (Round 4a, Stitch screens 1–2; audit §7.1, WRA-12/14/16/40).
 * Reads the stored list only (GET /recon/weeks): every week of the line, Outstanding
 * oldest first, Reconciled newest first, 26 at a time.
 */
import React, { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { CalendarRange, CheckCircle2, CircleDashed, Clock3, Loader2, Lock, Minus, Upload } from 'lucide-react';
import {
  fetchWeekList,
  type ReconWeekList,
  type ReconWeekListEntry,
} from '../../../services/reconApi';
import { ReconCalculatorBanner } from './ReconCalculatorBanner';
import {
  dayDots,
  formatDay,
  formatWeekRange,
  formatWeekTitle,
  sourceChip,
  stepNumberFor,
  type ChipTone,
} from './weekListFormat';
import { cn } from '../../ui/utils';

type Line = 'rideshare' | 'rush_delivery';
type Tab = 'outstanding' | 'completed';

const CARD = 'rounded-[20px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)]';

const CHIP_TONE: Record<ChipTone, string> = {
  done: 'bg-[#e5eeff] text-[#0b1c30]',
  needed: 'bg-[#fffbeb] text-[#92400e]',
  waiting: 'bg-[#fffbeb] text-[#92400e]',
  optional: 'bg-[#eff4ff] text-[#47464c]',
  blocks: 'bg-[#fff1f2] text-[#ba1a1a]',
};

function ChipIcon({ tone }: { tone: ChipTone }) {
  if (tone === 'done') return <CheckCircle2 className="h-4 w-4 text-[#069669]" aria-hidden />;
  if (tone === 'waiting') return <Clock3 className="h-4 w-4 text-[#b45309]" aria-hidden />;
  if (tone === 'needed') return <Upload className="h-4 w-4 text-[#b45309]" aria-hidden />;
  if (tone === 'blocks') return <CircleDashed className="h-4 w-4 text-[#ba1a1a]" aria-hidden />;
  return <Minus className="h-4 w-4 text-[#78767d]" aria-hidden />;
}

function KpiTile({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <div className={cn(CARD, 'flex flex-col justify-between gap-3 p-6')} data-testid={testId}>
      <span className="text-sm text-[#47464c]">{label}</span>
      {children}
    </div>
  );
}

function WeekCard({
  week,
  line,
  onOpen,
}: {
  week: ReconWeekListEntry;
  line: Line;
  onOpen: (weekKey: string) => void;
}) {
  const closed = week.state === 'closed';
  const chips = week.sources
    .map((s) => ({ id: s.id, chip: sourceChip(s) }))
    .filter((c): c is { id: string; chip: NonNullable<ReturnType<typeof sourceChip>> } => c.chip != null);
  const dots = dayDots(week.weekKey, week.sources);
  // Weeks adopted from the money record have no closer in Week Reconciliation.
  const adopted = closed && !week.closedBy;

  return (
    <article
      data-testid={`recon-week-${week.weekKey}`}
      className={cn(
        CARD,
        'flex flex-col items-start justify-between gap-6 p-6 transition-shadow hover:shadow-[0_2px_4px_rgba(0,0,0,0.03),0_12px_32px_rgba(15,23,42,0.08)] lg:flex-row lg:items-center',
      )}
    >
      <div className="flex min-w-[210px] flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {closed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#1e293b] px-2 py-0.5 text-[11px] font-bold text-white">
              <Lock className="h-3 w-3" aria-hidden /> Closed
            </span>
          ) : null}
          <h3 className="text-lg font-semibold text-[#0b1c30]">{formatWeekTitle(week.weekKey)}</h3>
        </div>
        <span className="text-sm text-[#47464c]">{formatWeekRange(week.weekKey)}</span>
        <div className="mt-1 flex items-center gap-1.5" aria-label="Days with data">
          {dots.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1">
              <span
                className={cn('h-2.5 w-2.5 rounded-full', d.hasData ? 'bg-[#069669]' : 'bg-[#d3e4fe]')}
                title={`${formatDay(d.day)}: ${d.hasData ? 'has data' : 'empty'}`}
              />
              <span className="text-[9px] font-bold text-[#47464c]">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-2">
        {closed ? (
          <p className="text-sm text-[#47464c]">
            {adopted
              ? 'Closed in Driver Settlements'
              : `Closed${week.closedAt ? ` ${formatDay(week.closedAt.slice(0, 10))}` : ''}`}
          </p>
        ) : (
          chips.map(({ id, chip }) => (
            <span
              key={id}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium', CHIP_TONE[chip.tone])}
            >
              <ChipIcon tone={chip.tone} />
              {chip.text}
            </span>
          ))
        )}
      </div>

      <div className="flex w-full flex-row items-center justify-between gap-3 lg:w-auto lg:flex-col lg:items-end">
        {closed ? null : (
          <div className="text-left lg:text-right">
            <p className="text-[13px] font-bold text-[#0b1c30]">Next: {week.nextAction.label}</p>
            <p className="text-[13px] text-[#47464c]">Step {stepNumberFor(week.nextAction)} of 8</p>
            {week.earlierOpenWeek ? (
              <p className="text-[12px] font-medium text-[#b45309]">
                Close the {formatWeekTitle(week.earlierOpenWeek).replace('Week', 'week')} first
              </p>
            ) : null}
          </div>
        )}
        <button
          type="button"
          onClick={() => onOpen(week.weekKey)}
          data-testid={`recon-open-${week.weekKey}`}
          className={cn(
            'h-11 whitespace-nowrap rounded-xl px-5 text-sm font-semibold shadow-sm transition-colors',
            closed
              ? 'border border-[#cbd5e1] bg-white text-[#0b1c30] hover:bg-[#eff4ff]'
              : 'bg-[#030213] text-white hover:bg-[#213145]',
          )}
          aria-label={`${closed ? 'View' : 'Open'} ${formatWeekTitle(week.weekKey)} (${line === 'rideshare' ? 'Rideshare' : 'Delivery'})`}
        >
          {closed ? 'View week' : 'Open week'}
        </button>
      </div>
    </article>
  );
}

export function ReconWeekLanding({
  line,
  onLineChange,
  showLineToggle,
  onOpenWeek,
  onDeliveryActive,
}: {
  line: Line;
  onLineChange: (line: Line) => void;
  /** WRA-15: shown only when Rush deliveries is active (decided by the server). */
  showLineToggle: boolean;
  onOpenWeek: (weekKey: string) => void;
  onDeliveryActive?: (active: boolean) => void;
}) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('outstanding');

  const query = useInfiniteQuery({
    queryKey: ['recon-week-list', line, year, tab],
    queryFn: ({ pageParam }) =>
      fetchWeekList(line, { year, status: tab, cursor: pageParam as string | null }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ReconWeekList) => last.nextCursor,
    staleTime: 30_000,
    retry: false,
  });

  const first = query.data?.pages[0];
  const weeks = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.weeks), [query.data]);
  const kpis = first?.kpis;
  React.useEffect(() => {
    if (first) onDeliveryActive?.(first.deliveryActive);
  }, [first, onDeliveryActive]);

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = thisYear; y >= 2025; y -= 1) out.push(y);
    return out;
  }, [thisYear]);

  return (
    <div className="space-y-6" data-testid="recon-week-list">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[#0b1c30]">Week Reconciliation</h1>
          <p className="text-sm text-[#47464c]">Close one week at a time, oldest first.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showLineToggle ? (
            <div className="flex rounded-2xl bg-[#eff4ff] p-1" role="tablist" aria-label="Service line">
              {(['rideshare', 'rush_delivery'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={line === l}
                  onClick={() => onLineChange(l)}
                  className={cn(
                    'rounded-xl px-5 py-2 text-sm font-semibold transition-colors',
                    line === l ? 'bg-[#030213] text-white shadow-sm' : 'text-[#0b1c30] hover:bg-white',
                  )}
                >
                  {l === 'rideshare' ? 'Rideshare' : 'Delivery'}
                </button>
              ))}
            </div>
          ) : null}
          <label className="flex items-center gap-2 rounded-2xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm font-semibold text-[#0b1c30]">
            <CalendarRange className="h-4 w-4" aria-hidden />
            <span className="sr-only">Year</span>
            <select
              className="bg-transparent outline-none"
              value={year ?? 'all'}
              onChange={(e) => setYear(e.target.value === 'all' ? null : Number(e.target.value))}
              data-testid="recon-year-picker"
            >
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="rounded-2xl bg-[#eff4ff] px-4 py-2.5">
        <ReconCalculatorBanner calculator={first?.calculator ?? null} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiTile label="Open weeks" testId="recon-kpi-open">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight text-[#0b1c30]">{kpis?.openWeeks ?? '—'}</span>
            <span className="text-sm text-[#47464c]">{line === 'rideshare' ? 'Rideshare' : 'Delivery'}</span>
          </div>
        </KpiTile>
        <KpiTile label="Required sources missing" testId="recon-kpi-missing">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight text-[#0b1c30]">{kpis?.requiredSourcesMissing ?? '—'}</span>
            <span className="text-sm text-[#47464c]">across open weeks</span>
          </div>
        </KpiTile>
        <KpiTile label="Oldest open week" testId="recon-kpi-oldest">
          {kpis?.oldestOpenWeek ? (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xl font-semibold text-[#0b1c30]">{formatWeekTitle(kpis.oldestOpenWeek)}</p>
                <p className="text-[13px] text-[#47464c]">
                  {formatWeekRange(kpis.oldestOpenWeek)}
                  {kpis.oldestOpenNextAction ? ` · Next: ${kpis.oldestOpenNextAction}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenWeek(kpis.oldestOpenWeek as string)}
                className="h-9 w-fit rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#eff4ff]"
              >
                Open week
              </button>
            </div>
          ) : (
            <p className="text-sm text-[#47464c]">No open weeks.</p>
          )}
        </KpiTile>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-2xl bg-[#eff4ff] p-1 shadow-sm" role="tablist" aria-label="Weeks">
          {([
            ['outstanding', 'Outstanding', kpis?.openWeeks],
            ['completed', 'Reconciled', kpis?.reconciledWeeks],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              data-testid={`recon-tab-${id}`}
              className={cn(
                'flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-colors',
                tab === id ? 'bg-[#030213] text-white shadow-sm' : 'text-[#0b1c30] hover:bg-white',
              )}
            >
              {label}
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-bold',
                  tab === id ? 'bg-[#213145] text-white' : 'bg-white text-[#0b1c30]',
                )}
              >
                {count ?? '—'}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-[12px] font-medium text-[#47464c]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#069669]" />Received</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#b45309]" />Needed</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#ba1a1a]" />Blocks closing</span>
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className={cn(CARD, 'h-32 animate-pulse bg-[#eff4ff]')} />)}
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-[#ffdad6] bg-[#fff1f2] px-4 py-3 text-sm text-[#93000a]">
          <p className="font-semibold">The week list could not load.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-2 h-9 rounded-xl bg-[#030213] px-4 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : weeks.length === 0 ? (
        <div className={cn(CARD, 'flex items-center gap-3 p-6 text-[#0b1c30]')}>
          <CheckCircle2 className="h-6 w-6 text-[#069669]" aria-hidden />
          <p className="font-medium">
            {tab === 'outstanding' ? 'Every ended week is closed.' : 'No closed weeks yet.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {weeks.map((week) => (
            <WeekCard key={week.weekKey} week={week} line={line} onOpen={onOpenWeek} />
          ))}
        </div>
      )}

      {query.hasNextPage ? (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="flex h-11 items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-6 text-sm font-semibold text-[#0b1c30] hover:bg-[#eff4ff]"
          >
            {query.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Load older weeks
          </button>
        </div>
      ) : null}
      {weeks.length > 0 ? (
        <p className="text-center text-[12px] text-[#47464c]">
          Showing {weeks.length} of {tab === 'outstanding' ? kpis?.openWeeks ?? weeks.length : kpis?.reconciledWeeks ?? weeks.length} weeks
        </p>
      ) : null}
    </div>
  );
}
