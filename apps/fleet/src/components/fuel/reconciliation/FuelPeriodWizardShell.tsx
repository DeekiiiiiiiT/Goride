/**
 * Wizard chrome: header, loading/error/empty, sticky continue footer (Stitch B/C).
 */
import React from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, ShieldCheck, StickyNote } from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import type { FuelStepId } from '../../../utils/fuelPeriodGating';
import { fuelPeriodLockBadge } from '../../../utils/fuelReconGlossary';

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
      <div className="min-w-0">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 flex min-h-11 items-center text-sm font-medium text-slate-500 transition-colors hover:text-[#3525cd]"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">Fuel Reconciliation</h2>
          <Badge
            variant={periodLocked ? 'secondary' : 'outline'}
            className={`uppercase tracking-wider ${
              periodLocked
                ? ''
                : 'border-emerald-200/60 bg-emerald-50 text-emerald-800'
            }`}
          >
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                periodLocked ? 'bg-slate-400' : 'bg-emerald-500'
              }`}
              aria-hidden
            />
            {fuelPeriodLockBadge(periodLocked)}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-slate-500">{period.label}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onResetPeriod && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden min-h-11 border-rose-200 text-rose-700 hover:bg-rose-50 sm:inline-flex"
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
        className="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center shadow-sm"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#3525cd]" />
        <p className="text-sm font-medium text-slate-700">Loading week data…</p>
        <p className="mt-1 text-xs text-slate-500">Hang tight — figures appear when ready.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-10 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left"
        role="alert"
      >
        <div>
          <p className="text-sm font-medium text-rose-900">Couldn’t load this week</p>
          <p className="mt-1 text-sm text-rose-800">
            Figures stay hidden until load succeeds — check your connection and try again.
          </p>
        </div>
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
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-16 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-800">No fuel spend this week yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Refresh after new fills post, or pick another period.
        </p>
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
  stopToStopBlocking = false,
  moneyNeedsAccept = false,
  continueLabel,
  onContinue,
  onAddNote,
  onFinalize,
  finalizeDisabled,
  finalizing,
  finalizeBlockedReason,
}: {
  isLast: boolean;
  canContinue: boolean;
  activeStepId: FuelStepId;
  leakageReviewed: boolean;
  /** S2S hard-blocks Finalize — honest footer when money residual is already clear. */
  stopToStopBlocking?: boolean;
  moneyNeedsAccept?: boolean;
  continueLabel: string;
  onContinue: () => void;
  onAddNote?: () => void;
  /** Last step — primary lock action (replaces Continue). */
  onFinalize?: () => void;
  finalizeDisabled?: boolean;
  finalizing?: boolean;
  /** Specific why Finalize is locked (closable gate / second approver / etc.). */
  finalizeBlockedReason?: string | null;
}) {
  const blockedCopy = isLast
    ? finalizeDisabled
      ? finalizeBlockedReason || 'Clear blockers above, then Finalize week.'
      : 'Ready to lock this week'
    : activeStepId === 'adjustments-disputes'
      ? 'Resolve open disputes before continuing.'
      : activeStepId === 'leakage-gap' && stopToStopBlocking && !moneyNeedsAccept
        ? 'Fix stop-to-stop blockers, then Continue — Finalize still requires mileage to close.'
        : activeStepId === 'leakage-gap' && !leakageReviewed && moneyNeedsAccept
          ? 'Use “Mark reviewed” above, or finish gap review.'
          : activeStepId === 'data-quality'
            ? 'Mark every flagged vehicle reviewed before continuing.'
            : 'Finish remaining items on this step to continue.';

  const primaryDisabled = isLast
    ? Boolean(finalizeDisabled || finalizing || !onFinalize)
    : !canContinue;
  const primaryLabel = isLast
    ? finalizing
      ? 'Finalizing…'
      : 'Finalize week'
    : continueLabel;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] backdrop-blur-md shadow-[0_-4px_12px_rgba(15,23,42,0.06)] md:static md:mt-4 md:rounded-xl md:border md:bg-white md:pb-3 md:pt-3 md:shadow-sm md:backdrop-blur-none">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 md:flex-1">
          {primaryDisabled && !finalizing ? (
            <p className="flex items-start gap-2 text-xs text-rose-700 md:text-sm">
              <span
                className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600"
                aria-hidden
              />
              {blockedCopy}
            </p>
          ) : (
            <p className="hidden items-center gap-1.5 text-xs text-slate-500 md:flex">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {isLast ? 'Ready to lock' : 'Ready to continue'}
            </p>
          )}
        </div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          <Button
            type="button"
            disabled={primaryDisabled}
            className="h-12 min-h-12 w-full rounded-xl bg-[#3525cd] text-base font-semibold tracking-wide text-white shadow-sm hover:bg-[#2a1ea4] disabled:bg-slate-300 md:w-auto md:px-6"
            onClick={() => {
              if (isLast) onFinalize?.();
              else onContinue();
            }}
          >
            {primaryLabel}
            {!isLast && <ArrowRight className="ml-2 h-4 w-4" aria-hidden />}
          </Button>
          {onAddNote && !isLast && (
            <button
              type="button"
              className="flex h-10 w-full items-center justify-center text-sm text-slate-500 transition-colors hover:text-[#3525cd] md:w-auto md:px-2"
              onClick={onAddNote}
            >
              <StickyNote className="mr-1.5 h-4 w-4 text-slate-400" aria-hidden />
              Add a note for the record
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
