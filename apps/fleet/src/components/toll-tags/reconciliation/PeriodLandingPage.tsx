import { Loader2, HelpCircle, CarFront, Route, DollarSign, ShieldCheck, Unlink as UnlinkIcon, Check, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
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
            <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Completed
            </span>
          )}
        </CardContent>
      </Card>
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
      <div className="rounded-md border border-dashed border-slate-200 py-12 text-center text-slate-500">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {periods.map((period) => (
        <PeriodCard key={period.id} period={period} onSelect={() => onSelectPeriod(period)} />
      ))}
    </div>
  );
}

export function PeriodLandingPage({
  driverId: _driverId,
  onSelectPeriod,
  outstanding,
  reconciled,
  totals,
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
  const defaultTab = outstanding.length > 0 ? 'outstanding' : 'completed';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Toll Reconciliation</h2>
        <p className="text-slate-500">Select a period to reconcile, step by step.</p>
      </div>

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

      {isEmpty ? (
        <div className="rounded-md border border-dashed border-slate-200 py-12 text-center text-slate-500">
          No toll activity recorded yet.
        </div>
      ) : (
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:max-w-md">
            <TabsTrigger value="outstanding" className="gap-1.5">
              Outstanding
              {outstanding.length > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {outstanding.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1.5">
              Completed
              {reconciled.length > 0 && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 leading-none">
                  {reconciled.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outstanding" className="mt-4">
            <PeriodList
              periods={outstanding}
              emptyMessage="No outstanding periods — everything is caught up."
              onSelectPeriod={onSelectPeriod}
            />
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            <PeriodList
              periods={reconciled}
              emptyMessage="No completed periods yet."
              onSelectPeriod={onSelectPeriod}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
