import { Loader2, HelpCircle, CarFront, Route, DollarSign, ShieldCheck, Unlink as UnlinkIcon, Check, AlertTriangle, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { ReconciliationPeriod, ReconciliationTotals } from '../../../hooks/useTollReconciliationPeriods';
import { StepId, STEP_ORDER } from '../../../utils/tollPeriodGating';
import { TollFinancialOverviewCards } from './TollFinancialOverviewCards';

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
  onSelectPeriod: (period: ReconciliationPeriod) => void;
  outstanding: ReconciliationPeriod[];
  reconciled: ReconciliationPeriod[];
  totals: ReconciliationTotals;
  workflowStageBackfillComplete: boolean;
  loading: boolean;
}

function StepChip({ stepId, counts }: { stepId: StepId; counts: ReconciliationPeriod['counts'] }) {
  const Icon = STEP_ICONS[stepId];
  const { actionable } = counts[stepId];
  const isClear = actionable === 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
        isClear
          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
    >
      {isClear ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
      {!isClear && actionable}
    </span>
  );
}

function PeriodCard({ period, onSelect }: { period: ReconciliationPeriod; onSelect: () => void }) {
  const isOutstanding = period.status === 'outstanding';
  return (
    <button type="button" onClick={onSelect} className="w-full text-left">
      <Card className="transition-colors hover:border-indigo-300 hover:shadow-sm">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div>
            <div className="font-semibold text-slate-900">{period.label}</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {STEP_ORDER.map((stepId) => (
                <StepChip key={stepId} stepId={stepId} counts={period.counts} />
              ))}
            </div>
          </div>
          {isOutstanding ? (
            <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white">
              {period.actionableTotal} to review
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
              Review
            </span>
          )}
        </CardContent>
      </Card>
    </button>
  );
}

export function PeriodLandingPage({
  driverId: _driverId,
  onSelectPeriod,
  outstanding,
  reconciled,
  totals,
  workflowStageBackfillComplete,
  loading,
}: PeriodLandingPageProps) {

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <span className="ml-2 text-slate-500">Loading reconciliation periods...</span>
      </div>
    );
  }

  const isEmpty = outstanding.length === 0 && reconciled.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Toll Reconciliation</h2>
        <p className="text-slate-500">Select a period to reconcile, step by step.</p>
      </div>

      {/* All-time financial snapshot across every period — read-only, no
          actions live here; select a period below to work through its steps. */}
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
      />

      {!workflowStageBackfillComplete && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Some historical tolls haven't been re-indexed yet — counts for older periods may be incomplete.
        </div>
      )}

      {isEmpty && (
        <div className="rounded-md border border-dashed border-slate-200 py-12 text-center text-slate-500">
          No toll activity recorded yet.
        </div>
      )}

      {outstanding.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Outstanding</h3>
          <div className="space-y-2">
            {outstanding.map((period) => (
              <PeriodCard key={period.id} period={period} onSelect={() => onSelectPeriod(period)} />
            ))}
          </div>
        </div>
      )}

      {reconciled.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Reconciled</h3>
          <div className="space-y-2">
            {reconciled.map((period) => (
              <PeriodCard key={period.id} period={period} onSelect={() => onSelectPeriod(period)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
