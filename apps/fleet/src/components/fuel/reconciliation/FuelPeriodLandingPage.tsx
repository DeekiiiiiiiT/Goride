import { useEffect, useMemo, useState } from 'react';
import { Check, Flag, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import { FUEL_STEP_LABELS, FUEL_STEP_ORDER, type FuelStepId } from '../../../utils/fuelPeriodGating';
import { FUEL_STEP_ICONS } from '../../../utils/fuelStepIcons';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { autoCloseStatusBadge } from '../../../utils/fuelAutoClose';
import { Sparkline } from '../../ui/Sparkline';
import {
  buildUnexplainedSparkSeries,
  unexplainedWowDelta,
} from '../../../utils/fuelUnexplainedSparkSeries';

/** Labeled step cell — clear at a glance; click opens that step (M3/M5). */
function StepStatusCell({
  stepId,
  counts,
  onOpenStep,
}: {
  stepId: FuelStepId;
  counts: FuelReconciliationPeriod['counts'];
  onOpenStep: (stepId: FuelStepId) => void;
}) {
  const Icon = FUEL_STEP_ICONS[stepId];
  const label = FUEL_STEP_LABELS[stepId];
  const { actionable } = counts[stepId];
  const isClear = actionable === 0;
  const statusText = isClear ? 'Done' : `${actionable} to review`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenStep(stepId);
      }}
      className={`flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors hover:ring-2 hover:ring-indigo-200 ${
        isClear
          ? 'border-emerald-100 bg-emerald-50/60'
          : 'border-amber-200 bg-amber-50'
      }`}
      aria-label={`${label}: ${statusText}. Open step.`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          isClear ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
        }`}
        aria-hidden
      >
        {isClear ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Icon className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-xs font-semibold leading-tight ${isClear ? 'text-emerald-800' : 'text-amber-900'}`}>
          {label}
        </div>
        <div className={`text-[11px] leading-tight ${isClear ? 'text-emerald-600' : 'font-medium text-amber-700'}`}>
          {statusText}
        </div>
      </div>
    </button>
  );
}

function daysOpen(startDate: string): number {
  const start = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000));
}

function PeriodCard({
  period,
  onSelect,
  onReset,
  onSelectStep,
  secondApproverThreshold,
  autoCloseDualApprovalMode,
  hasSettlementSnapshots,
  unexplainedSeries,
}: {
  period: FuelReconciliationPeriod;
  onSelect: () => void;
  onReset?: () => void;
  onSelectStep?: (period: FuelReconciliationPeriod, stepId: FuelStepId) => void;
  secondApproverThreshold?: number;
  autoCloseDualApprovalMode?: string;
  hasSettlementSnapshots?: boolean;
  unexplainedSeries?: number[];
}) {
  const autoCloseBadge = autoCloseStatusBadge({
    locked: period.locked,
    actionableTotal: period.actionableTotal,
    netLeakage: period.netLeakage,
    // Server leakage review zeros actionable; treat clear leakage step as reviewed for badge.
    leakageReviewed: period.counts['leakage-gap']?.actionable === 0,
    totalSpend: period.totalSpend,
    secondApproverThreshold,
    hasSettlementSnapshots,
    autoCloseDualApprovalMode,
  });
  const wow = unexplainedWowDelta(unexplainedSeries || []);
  const sparkLabel =
    unexplainedSeries && unexplainedSeries.length >= 2
      ? `Unexplained trend: latest ${formatFuelMoney(period.netLeakage)}${
          wow === null
            ? ''
            : `, ${wow >= 0 ? 'up' : 'down'} ${formatFuelMoney(Math.abs(wow))} vs prior week`
        }`
      : undefined;
  const isOutstanding = period.status === 'outstanding';
  const isInProgress = period.status === 'in_progress';
  const age = daysOpen(period.startDate);
  const aging = !period.locked && age >= 14;
  const ctaClass = isOutstanding
    ? 'bg-amber-500 text-white'
    : isInProgress
      ? 'bg-sky-600 text-white'
      : 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  const ctaLabel = isOutstanding
    ? period.actionableTotal > 0
      ? `${period.actionableTotal} to review`
      : 'Open week'
    : isInProgress
      ? period.actionableTotal > 0
        ? `${period.actionableTotal} left`
        : 'Continue'
      : 'Completed';

  return (
    <Card className={`transition-colors hover:border-indigo-300 hover:shadow-sm ${aging ? 'border-amber-300' : ''}`}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold text-slate-900">{period.label}</div>
              {!period.locked && (
                <span className={`text-[11px] font-medium ${aging ? 'text-amber-700' : 'text-slate-400'}`}>
                  {age}d open
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
              <span>{period.vehicleCount} vehicle{period.vehicleCount === 1 ? '' : 's'}</span>
              <span>Spend {formatFuelMoney(period.totalSpend)}</span>
              <span
                className={`inline-flex items-center gap-1.5 ${period.netLeakage !== 0 ? 'text-rose-600' : ''}`}
                aria-label={sparkLabel}
              >
                Unexplained {formatFuelMoney(period.netLeakage)}
                {unexplainedSeries && unexplainedSeries.length >= 2 && (
                  <Sparkline
                    values={unexplainedSeries}
                    stroke={period.netLeakage !== 0 ? '#e11d48' : '#64748b'}
                  />
                )}
              </span>
              {autoCloseBadge && (
                <Badge
                  variant="outline"
                  className={
                    autoCloseBadge.tone === 'eligible'
                      ? 'border-emerald-200 text-[10px] text-emerald-700'
                      : 'border-amber-200 text-[10px] text-amber-800'
                  }
                >
                  {autoCloseBadge.label}
                </Badge>
              )}
              {period.exceptionCount > 0 && (
                <span className="font-medium text-rose-700">
                  {period.exceptionCount} exception{period.exceptionCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-2 self-start">
            {period.status === 'completed' && onReset && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 border-rose-200 text-rose-700 hover:bg-rose-50 sm:min-h-9"
                onClick={(e) => {
                  e.stopPropagation();
                  onReset();
                }}
              >
                Reopen week
              </Button>
            )}
            <button
              type="button"
              onClick={onSelect}
              className={`min-h-11 rounded-full px-2.5 py-1 text-xs font-bold sm:min-h-0 ${ctaClass}`}
            >
              {ctaLabel}
            </button>
          </div>
        </div>

        <div
          className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
          role="group"
          aria-label={`Week steps for ${period.label}`}
        >
          {FUEL_STEP_ORDER.map((stepId) => (
            <StepStatusCell
              key={stepId}
              stepId={stepId}
              counts={period.counts}
              onOpenStep={(id) => (onSelectStep ? onSelectStep(period, id) : onSelect())}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function sortByAbsUnexplained(periods: FuelReconciliationPeriod[]): FuelReconciliationPeriod[] {
  return [...periods].sort((a, b) => Math.abs(b.netLeakage) - Math.abs(a.netLeakage));
}

function PeriodList({
  periods,
  allPeriodsForSpark,
  emptyLabel,
  onSelectPeriod,
  onResetPeriod,
  onSelectStep,
  varianceFirst,
  secondApproverThreshold,
  autoCloseDualApprovalMode,
  weeksWithSnapshots,
}: {
  periods: FuelReconciliationPeriod[];
  allPeriodsForSpark: FuelReconciliationPeriod[];
  emptyLabel: string;
  onSelectPeriod: (period: FuelReconciliationPeriod) => void;
  onResetPeriod?: (period: FuelReconciliationPeriod) => void;
  onSelectStep?: (period: FuelReconciliationPeriod, stepId: FuelStepId) => void;
  varianceFirst?: boolean;
  secondApproverThreshold?: number;
  autoCloseDualApprovalMode?: string;
  weeksWithSnapshots?: Set<string>;
}) {
  const ordered = varianceFirst ? sortByAbsUnexplained(periods) : periods;
  if (ordered.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 py-12 text-center text-slate-500">
        {emptyLabel}
      </div>
    );
  }
  const sparkPoints = allPeriodsForSpark.map((p) => ({
    startDate: p.startDate,
    unexplained: p.netLeakage,
  }));
  return (
    <div className="space-y-3">
      {ordered.map((p) => (
        <PeriodCard
          key={p.id}
          period={p}
          onSelect={() => onSelectPeriod(p)}
          onSelectStep={onSelectStep}
          secondApproverThreshold={secondApproverThreshold}
          autoCloseDualApprovalMode={autoCloseDualApprovalMode}
          hasSettlementSnapshots={weeksWithSnapshots?.has(p.startDate) ?? undefined}
          unexplainedSeries={buildUnexplainedSparkSeries(sparkPoints, p.startDate)}
          onReset={
            p.status === 'completed' && onResetPeriod
              ? () => onResetPeriod(p)
              : undefined
          }
        />
      ))}
    </div>
  );
}

interface FuelPeriodLandingPageProps {
  outstanding: FuelReconciliationPeriod[];
  inProgress: FuelReconciliationPeriod[];
  completed: FuelReconciliationPeriod[];
  loading: boolean;
  onSelectPeriod: (period: FuelReconciliationPeriod, stepId?: FuelStepId) => void;
  onResetPeriod?: (period: FuelReconciliationPeriod) => void;
  onOpenArchive?: () => void;
  onBulkFinalize?: () => void;
  onBulkReopen?: () => void;
  dataTruncated?: boolean;
  /** Org dual-approval threshold for auto-close badge honesty (NEW-9). */
  secondApproverThreshold?: number;
  /** Org auto-close dual mode — affects badge when spend is high. */
  autoCloseDualApprovalMode?: string;
  /** Week starts that already have finalized_report snapshots (v1 auto-close gate). */
  weeksWithSnapshots?: Set<string>;
}

export function FuelPeriodLandingPage({
  outstanding,
  inProgress,
  completed,
  loading,
  onSelectPeriod,
  onResetPeriod,
  onOpenArchive,
  onBulkFinalize,
  onBulkReopen,
  dataTruncated,
  secondApproverThreshold,
  autoCloseDualApprovalMode,
  weeksWithSnapshots,
}: FuelPeriodLandingPageProps) {
  const openWorkCount = outstanding.length + inProgress.length;
  const preferredTab =
    outstanding.length > 0
      ? 'outstanding'
      : inProgress.length > 0
        ? 'in_progress'
        : 'completed';
  const [tab, setTab] = useState(preferredTab);

  // M4: keep tab aligned when finalize drains Outstanding
  useEffect(() => {
    setTab(preferredTab);
  }, [preferredTab]);

  const portfolio = useMemo(() => {
    const open = [...outstanding, ...inProgress];
    const totalUnexplained = open.reduce((s, p) => s + p.netLeakage, 0);
    const oldest = open
      .slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return {
      openWeeks: open.length,
      totalUnexplained,
      oldestLabel: oldest?.label || null,
      oldestDays: oldest ? daysOpen(oldest.startDate) : 0,
    };
  }, [outstanding, inProgress]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <span className="ml-2 text-slate-500">Loading fuel periods…</span>
      </div>
    );
  }

  const isEmpty = openWorkCount === 0 && completed.length === 0;

  return (
    <div className="space-y-6">
      {dataTruncated && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          Fuel entry or trip data hit a fetch cap — week money may be incomplete. Narrow the date range or raise the limit before finalizing.
        </div>
      )}

      {openWorkCount > 0 && (
        <section className="grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Open weeks</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{portfolio.openWeeks}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Unexplained (open)</p>
            <p className={`text-2xl font-bold tabular-nums ${portfolio.totalUnexplained !== 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {formatFuelMoney(portfolio.totalUnexplained)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Oldest unclosed</p>
            <p className="text-sm font-semibold text-slate-900">{portfolio.oldestLabel || '—'}</p>
            {portfolio.oldestDays > 0 && (
              <p className="text-xs text-slate-500">{portfolio.oldestDays} days open</p>
            )}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
          {onBulkFinalize && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start min-h-10 gap-1.5"
              disabled={openWorkCount === 0}
              onClick={onBulkFinalize}
            >
              <Flag className="h-4 w-4" />
              Finalize weeks
              {openWorkCount > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 px-1.5 text-xs">
                  {openWorkCount}
                </Badge>
              )}
            </Button>
          )}
          {onBulkReopen && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start min-h-10"
              disabled={completed.length === 0}
              onClick={onBulkReopen}
            >
              Reopen weeks
            </Button>
          )}
          {onOpenArchive && (
            <Button type="button" variant="ghost" size="sm" className="self-start text-slate-600" onClick={onOpenArchive}>
              Finalized archive
            </Button>
          )}
      </div>

      {isEmpty ? (
        <div className="rounded-md border border-dashed border-slate-200 py-12 text-center text-slate-500">
          No fuel activity in recent weeks yet.
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:max-w-lg">
            <TabsTrigger value="outstanding" className="gap-1.5 min-h-11 sm:min-h-9">
              Outstanding
              {outstanding.length > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {outstanding.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="in_progress" className="gap-1.5 min-h-11 sm:min-h-9">
              In Progress
              {inProgress.length > 0 && (
                <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {inProgress.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1.5 min-h-11 sm:min-h-9">
              Completed
              {completed.length > 0 && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 leading-none">
                  {completed.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outstanding" className="mt-4">
            <PeriodList
              periods={outstanding}
              allPeriodsForSpark={[...outstanding, ...inProgress, ...completed]}
              emptyLabel="No outstanding periods — check In Progress or Completed."
              onSelectPeriod={(p) => onSelectPeriod(p)}
              onSelectStep={(p, step) => onSelectPeriod(p, step)}
              varianceFirst
              secondApproverThreshold={secondApproverThreshold}
              autoCloseDualApprovalMode={autoCloseDualApprovalMode}
              weeksWithSnapshots={weeksWithSnapshots}
            />
          </TabsContent>

          <TabsContent value="in_progress" className="mt-4">
            <PeriodList
              periods={inProgress}
              allPeriodsForSpark={[...outstanding, ...inProgress, ...completed]}
              emptyLabel="No weeks in progress."
              onSelectPeriod={(p) => onSelectPeriod(p)}
              onSelectStep={(p, step) => onSelectPeriod(p, step)}
              secondApproverThreshold={secondApproverThreshold}
              autoCloseDualApprovalMode={autoCloseDualApprovalMode}
              weeksWithSnapshots={weeksWithSnapshots}
            />
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            <PeriodList
              periods={completed}
              allPeriodsForSpark={[...outstanding, ...inProgress, ...completed]}
              emptyLabel="No completed periods yet."
              onSelectPeriod={(p) => onSelectPeriod(p)}
              onSelectStep={(p, step) => onSelectPeriod(p, step)}
              onResetPeriod={onResetPeriod}
              secondApproverThreshold={secondApproverThreshold}
              autoCloseDualApprovalMode={autoCloseDualApprovalMode}
              weeksWithSnapshots={weeksWithSnapshots}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
