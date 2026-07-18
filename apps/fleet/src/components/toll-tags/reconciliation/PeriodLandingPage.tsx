import { useMemo, useState } from 'react';
import {
  Loader2,
  HelpCircle,
  CarFront,
  Route,
  DollarSign,
  ShieldCheck,
  Unlink as UnlinkIcon,
  Check,
  RotateCcw,
  ClipboardList,
  ChevronRight,
  Filter,
  type LucideIcon,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Button } from '../../ui/button';
import { ReconciliationPeriod, ReconciliationTotals } from '../../../hooks/useTollReconciliationPeriods';
import { StepId, STEP_ORDER } from '../../../utils/tollPeriodGating';
import { TollFinancialOverviewCards } from './TollFinancialOverviewCards';
import { BulkPeriodResetDialog } from './BulkPeriodResetDialog';

const STEP_ICONS: Record<StepId, LucideIcon> = {
  'needs-review': HelpCircle,
  'personal-use': CarFront,
  deadhead: Route,
  'underpaid-claims': DollarSign,
  'dispute-refunds': ShieldCheck,
  'unlinked-refunds': UnlinkIcon,
};

interface PeriodLandingPageProps {
  driverId?: string;
  drivers?: Array<{ id: string; name: string }>;
  selectedDriverId?: string;
  onDriverChange?: (driverId: string) => void;
  onSelectPeriod: (period: ReconciliationPeriod) => void;
  onPeriodsReset?: () => void;
  outstanding: ReconciliationPeriod[];
  reconciled: ReconciliationPeriod[];
  totals: ReconciliationTotals;
  loading: boolean;
}

function periodDateBadge(startDate: string) {
  const d = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { month: '—', day: '—' };
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()).padStart(2, '0'),
  };
}

function StepChip({ stepId, counts }: { stepId: StepId; counts: ReconciliationPeriod['counts'] }) {
  const Icon = STEP_ICONS[stepId];
  const { actionable } = counts[stepId];
  const isClear = actionable === 0;
  return (
    <span
      className={`inline-flex min-h-[28px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        isClear
          ? 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700'
          : 'border-amber-200/80 bg-amber-50/80 text-amber-800'
      }`}
    >
      {isClear ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Icon className="h-3.5 w-3.5" aria-hidden />}
      {!isClear && <span className="tabular-nums">{actionable}</span>}
    </span>
  );
}

function PeriodCard({ period, onSelect }: { period: ReconciliationPeriod; onSelect: () => void }) {
  const isOutstanding = period.status === 'outstanding';
  const f = period.financials;
  const badge = periodDateBadge(period.startDate);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group w-full min-h-[72px] rounded-2xl border border-indigo-100/60 bg-white/70 p-5 text-left shadow-sm backdrop-blur-sm transition-all duration-200 ease-in-out hover:border-indigo-300/60 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4 sm:items-center sm:gap-6">
          <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-indigo-50">
            <span className="text-[11px] font-medium uppercase leading-none text-slate-500">{badge.month}</span>
            <span className="text-xl font-semibold leading-none text-indigo-700">{badge.day}</span>
          </div>
          <div className="min-w-0">
            <h5 className="text-lg font-semibold tracking-tight text-slate-900">{period.label}</h5>
            {f && (f.tollSpend > 0 || f.reimbursedByPlatform > 0 || f.chargedToDrivers > 0) && (
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                <span className="text-slate-500">
                  Spend: <span className="font-bold tabular-nums text-slate-900">${f.tollSpend.toFixed(0)}</span>
                </span>
                <span className="text-slate-500">
                  Reimbursed:{' '}
                  <span className="font-bold tabular-nums text-emerald-700">${f.reimbursedByPlatform.toFixed(0)}</span>
                </span>
                <span className="text-slate-500">
                  Loss: <span className="font-bold tabular-nums text-rose-600">${f.netTollLoss.toFixed(0)}</span>
                </span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {STEP_ORDER.map((stepId) => (
                <StepChip key={stepId} stepId={stepId} counts={period.counts} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 self-end lg:self-center">
          {isOutstanding ? (
            <span className="inline-flex min-h-[44px] items-center rounded-lg bg-amber-800 px-4 py-2 text-xs font-semibold text-white shadow-sm">
              {period.actionableTotal} to review
            </span>
          ) : (
            <span className="inline-flex min-h-[44px] items-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
              Completed
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function PeriodList({
  periods,
  emptyMessage,
  onSelectPeriod,
}: {
  periods: ReconciliationPeriod[];
  emptyMessage: string;
  onSelectPeriod: (period: ReconciliationPeriod) => void;
}) {
  if (periods.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-indigo-200/80 bg-white/50 py-16 text-center text-slate-500">
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {periods.map((period) => (
        <PeriodCard key={period.id} period={period} onSelect={() => onSelectPeriod(period)} />
      ))}
    </div>
  );
}

export function PeriodLandingPage({
  driverId,
  drivers = [],
  selectedDriverId = '',
  onDriverChange,
  onSelectPeriod,
  onPeriodsReset,
  outstanding,
  reconciled,
  totals,
  loading,
}: PeriodLandingPageProps) {
  const [bulkResetOpen, setBulkResetOpen] = useState(false);
  const allPeriods = useMemo(
    () => [...outstanding, ...reconciled],
    [outstanding, reconciled],
  );

  const pendingLoss = useMemo(() => {
    const fromOutstanding = outstanding.reduce((sum, p) => sum + (p.financials?.netTollLoss ?? 0), 0);
    return fromOutstanding > 0 ? fromOutstanding : totals.netTollLoss;
  }, [outstanding, totals.netTollLoss]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" aria-hidden />
        <span className="text-slate-500">Loading reconciliation periods...</span>
      </div>
    );
  }

  const isEmpty = outstanding.length === 0 && reconciled.length === 0;
  const defaultTab = outstanding.length > 0 ? 'outstanding' : 'completed';
  const showActionBanner = totals.needsReviewCount > 0;

  return (
    <div className="space-y-8">
      {/* Header — Stitch premium redesign */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <nav className="mb-2 flex items-center gap-2 text-[11px] font-medium text-slate-500" aria-label="Breadcrumb">
            <span>Finance</span>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <span className="font-bold text-indigo-700" aria-current="page">Toll Reconciliation</span>
          </nav>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Toll Reconciliation</h2>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">
            Audit and reconcile toll expenses across the fleet. Approve period-based spending and handle driver reimbursements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onDriverChange && (
            <label className="relative inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-wide text-slate-600 transition-colors hover:bg-indigo-50/50">
              <Filter className="h-4 w-4 text-slate-400" aria-hidden />
              <span className="sr-only">Filter by driver</span>
              <select
                value={selectedDriverId}
                onChange={(e) => onDriverChange(e.target.value)}
                className="min-h-[44px] cursor-pointer border-none bg-transparent py-2 pr-1 text-sm font-semibold normal-case tracking-normal text-slate-700 focus:outline-none focus:ring-0"
              >
                <option value="">All Drivers</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          )}
          {!isEmpty && (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] gap-2 rounded-lg border-slate-200 text-slate-600 transition-all duration-200 hover:bg-indigo-50/50"
              onClick={() => setBulkResetOpen(true)}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reset periods
            </Button>
          )}
        </div>
      </div>

      {/* Action Required banner */}
      {showActionBanner && (
        <section
          className="relative flex flex-col gap-6 overflow-hidden rounded-2xl border border-indigo-200/40 bg-indigo-100/70 p-6 sm:flex-row sm:items-center sm:justify-between"
          aria-labelledby="action-required-heading"
        >
          <div className="flex items-start gap-4 sm:items-center sm:gap-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-700 text-white shadow-xl shadow-indigo-700/30">
              <ClipboardList className="h-8 w-8" aria-hidden />
            </div>
            <div>
              <h3 id="action-required-heading" className="text-xl font-semibold text-slate-900">Action Required</h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                <span className="font-bold text-indigo-700">{totals.tollsNeedingReviewCount} tolls</span>
                {' '}require manual review across{' '}
                <span className="font-bold text-indigo-700">{totals.refundsNeedingReviewCount} refunds</span>
                . Reconcile these to unlock the next period.
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-3xl font-bold tracking-tight text-indigo-700 tabular-nums sm:text-4xl">
              ${pendingLoss.toFixed(2)}
            </div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Pending Reconciliation
            </div>
          </div>
        </section>
      )}

      <TollFinancialOverviewCards
        tollSpend={totals.tollSpend}
        reimbursedAmount={totals.reimbursedByPlatform}
        scopedDisputeRefund={totals.matchedDisputeRefundAmount}
        chargedToDrivers={totals.chargedToDrivers}
        netTollLoss={totals.netTollLoss}
        needsReviewCount={totals.needsReviewCount}
        tollsNeedingReviewCount={totals.tollsNeedingReviewCount}
        refundsNeedingReviewCount={totals.refundsNeedingReviewCount}
        resolvedRefundsAmount={totals.resolvedRefundsAmount}
        showNeedsReviewCard={false}
      />

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-indigo-200/80 bg-white/50 py-16 text-center text-slate-500">
          <p className="text-sm font-medium">No toll activity recorded yet.</p>
          <p className="mt-1 text-xs text-slate-400">Import tolls or wait for sync — periods will appear here.</p>
        </div>
      ) : (
        <Tabs defaultValue={defaultTab} className="w-full space-y-4">
          <div className="flex flex-col gap-3 border-t border-indigo-100/80 pt-4 sm:flex-row sm:items-center">
            <TabsList className="h-auto rounded-lg bg-indigo-50 p-1">
              <TabsTrigger
                value="outstanding"
                className="min-h-[44px] gap-1.5 rounded-md px-6 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
              >
                Outstanding
                {outstanding.length > 0 && (
                  <span className="tabular-nums">({outstanding.length})</span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="completed"
                className="min-h-[44px] gap-1.5 rounded-md px-6 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
              >
                Completed
                {reconciled.length > 0 && (
                  <span className="tabular-nums">({reconciled.length})</span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="outstanding" className="mt-0">
            <PeriodList
              periods={outstanding}
              emptyMessage="No outstanding periods — everything is caught up."
              onSelectPeriod={onSelectPeriod}
            />
          </TabsContent>

          <TabsContent value="completed" className="mt-0">
            <PeriodList
              periods={reconciled}
              emptyMessage="No completed periods yet."
              onSelectPeriod={onSelectPeriod}
            />
          </TabsContent>
        </Tabs>
      )}

      <BulkPeriodResetDialog
        open={bulkResetOpen}
        onOpenChange={setBulkResetOpen}
        periods={allPeriods}
        drivers={drivers}
        preselectedDriverId={driverId}
        onComplete={() => onPeriodsReset?.()}
      />
    </div>
  );
}
