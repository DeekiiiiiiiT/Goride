import { Check, AlertTriangle, Scale, Shield, Droplets, ClipboardList, Flag, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Button } from '../../ui/button';
import { Loader2 } from 'lucide-react';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import { FUEL_STEP_ORDER, type FuelStepId } from '../../../utils/fuelPeriodGating';
import { FuelReconBusyProvider } from './fuelReconBusyLock';

const STEP_ICONS: Record<FuelStepId, LucideIcon> = {
  'data-quality': AlertTriangle,
  'adjustments-disputes': Scale,
  'policy-check': Shield,
  'leakage-gap': Droplets,
  'settlement-preview': ClipboardList,
  finalize: Flag,
};

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function StepChip({ stepId, counts }: { stepId: FuelStepId; counts: FuelReconciliationPeriod['counts'] }) {
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

function PeriodCard({
  period,
  onSelect,
  onReset,
}: {
  period: FuelReconciliationPeriod;
  onSelect: () => void;
  onReset?: () => void;
}) {
  const isOutstanding = period.status === 'outstanding';
  return (
    <Card className="transition-colors hover:border-indigo-300 hover:shadow-sm">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="font-semibold text-slate-900">{period.label}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span>{period.vehicleCount} vehicle{period.vehicleCount === 1 ? '' : 's'}</span>
            <span>Spend {formatMoney(period.totalSpend)}</span>
            <span className={period.netLeakage > 0 ? 'text-rose-600' : ''}>
              Net unassigned {formatMoney(period.netLeakage)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {FUEL_STEP_ORDER.map((stepId) => (
              <StepChip key={stepId} stepId={stepId} counts={period.counts} />
            ))}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {!isOutstanding && onReset && (
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
              Reset
            </Button>
          )}
          <button
            type="button"
            onClick={onSelect}
            className={`min-h-11 rounded-full px-2.5 py-1 text-xs font-bold sm:min-h-0 ${
              isOutstanding
                ? 'bg-amber-500 text-white'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {isOutstanding
              ? period.actionableTotal > 0
                ? `${period.actionableTotal} to review`
                : 'Open week'
              : 'Completed'}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

interface FuelPeriodLandingPageProps {
  outstanding: FuelReconciliationPeriod[];
  completed: FuelReconciliationPeriod[];
  loading: boolean;
  onSelectPeriod: (period: FuelReconciliationPeriod) => void;
  onResetPeriod?: (period: FuelReconciliationPeriod) => void;
  onOpenArchive?: () => void;
}

export function FuelPeriodLandingPage({
  outstanding,
  completed,
  loading,
  onSelectPeriod,
  onResetPeriod,
  onOpenArchive,
}: FuelPeriodLandingPageProps) {
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <span className="ml-2 text-slate-500">Loading fuel periods…</span>
      </div>
    );
  }

  const isEmpty = outstanding.length === 0 && completed.length === 0;
  const defaultTab = outstanding.length > 0 ? 'outstanding' : 'completed';

  return (
    <FuelReconBusyProvider>
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Consumption Reconciliation</h2>
          <p className="text-slate-500">Close each Monday–Sunday week, step by step.</p>
        </div>
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
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:max-w-md">
            <TabsTrigger value="outstanding" className="gap-1.5 min-h-11 sm:min-h-9">
              Outstanding
              {outstanding.length > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {outstanding.length}
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

          <TabsContent value="outstanding" className="mt-4 space-y-2">
            {outstanding.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 py-12 text-center text-slate-500">
                No outstanding periods — everything is caught up.
              </div>
            ) : (
              outstanding.map((p) => (
                <PeriodCard key={p.id} period={p} onSelect={() => onSelectPeriod(p)} />
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4 space-y-2">
            {completed.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 py-12 text-center text-slate-500">
                No completed periods yet.
              </div>
            ) : (
              completed.map((p) => (
                <PeriodCard
                  key={p.id}
                  period={p}
                  onSelect={() => onSelectPeriod(p)}
                  onReset={onResetPeriod ? () => onResetPeriod(p) : undefined}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
    </FuelReconBusyProvider>
  );
}
