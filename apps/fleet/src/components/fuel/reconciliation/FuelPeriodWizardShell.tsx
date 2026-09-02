/**
 * Wizard chrome: header, loading/error/empty, sticky continue footer.
 */
import React from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import type { FuelStepId } from '../../../utils/fuelPeriodGating';

export function FuelPeriodWizardHeader({
  period,
  periodLocked,
  onBack,
  onResetPeriod,
}: {
  period: FuelReconciliationPeriod;
  periodLocked: boolean;
  onBack: () => void;
  onResetPeriod?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-2 flex min-h-11 items-center text-sm font-medium text-slate-500 transition-colors hover:text-[#3525cd]"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Periods
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">{period.label}</h2>
          <Badge
            variant={periodLocked ? 'secondary' : 'outline'}
            className="uppercase tracking-wider"
          >
            {periodLocked ? 'Locked' : 'Draft'}
          </Badge>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onResetPeriod && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 border-rose-200 text-rose-700 hover:bg-rose-50 sm:min-h-11"
            onClick={onResetPeriod}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            Reopen week
          </Button>
        )}
      </div>
    </div>
  );
}

export function FuelPeriodWizardBodyGate({
  loading,
  error,
  empty,
  updating,
  onRetry,
  children,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  updating?: boolean;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-white px-4 py-16 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#3525cd]" />
        <p className="text-sm text-slate-500">Loading week data…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-10 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left"
        role="alert"
      >
        <p className="text-sm text-rose-800">
          Couldn’t load this week’s reconciliation. Figures are hidden until load succeeds — check
          your connection and try again.
        </p>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 border-rose-200 bg-white text-rose-800 hover:bg-rose-50"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-500">
        No fuel spend for this week yet. Refresh after new fills post, or pick another period.
      </div>
    );
  }
  return (
    <>
      {updating && (
        <p className="text-xs text-slate-500" role="status" aria-live="polite">
          Updating week figures…
        </p>
      )}
      {children}
    </>
  );
}

export function FuelPeriodWizardContinueFooter({
  isLast,
  canContinue,
  activeStepId,
  leakageReviewed,
  continueLabel,
  onContinue,
}: {
  isLast: boolean;
  canContinue: boolean;
  activeStepId: FuelStepId;
  leakageReviewed: boolean;
  continueLabel: string;
  onContinue: () => void;
}) {
  if (isLast) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:rounded-lg sm:border sm:bg-white sm:pb-3 sm:backdrop-blur-none">
      <div className="mx-auto flex max-w-6xl flex-col items-end gap-1">
        {!canContinue && (
          <p className="text-right text-xs text-amber-700">
            {activeStepId === 'adjustments-disputes'
              ? 'Resolve open disputes before continuing.'
              : activeStepId === 'leakage-gap' && !leakageReviewed
                ? 'Use “Mark reviewed & continue” above, or finish gap review.'
                : 'Finish remaining items on this step to continue.'}
          </p>
        )}
        <Button
          type="button"
          disabled={!canContinue}
          className="min-h-11 bg-[#3525cd] text-white hover:bg-[#2a1ea4] disabled:bg-slate-300 sm:min-h-11"
          onClick={onContinue}
        >
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
