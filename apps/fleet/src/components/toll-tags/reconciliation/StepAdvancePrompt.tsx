import React from 'react';
import { Button } from '../../ui/button';
import { ArrowRight, CheckCircle2, PartyPopper } from 'lucide-react';

interface StepAdvancePromptProps {
  currentStepLabel: string;
  nextStepLabel?: string;
  isLastStep: boolean;
  onAdvance: () => void;
  /** Tighter layout for empty-state center placement. */
  compact?: boolean;
}

/** Prominent CTA when a wizard step has no remaining actionable items. */
export function StepAdvancePrompt({
  currentStepLabel,
  nextStepLabel,
  isLastStep,
  onAdvance,
  compact = false,
}: StepAdvancePromptProps) {
  const finishLabel = 'Reconciliation complete';
  const continueLabel = nextStepLabel ? `Continue to ${nextStepLabel}` : 'Continue';

  if (compact) {
    return (
      <div className="mt-8 w-full max-w-md mx-auto rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-indigo-50 px-6 py-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <p className="text-base font-bold text-slate-900 mb-1">{currentStepLabel} complete!</p>
        <p className="text-sm text-slate-600 mb-5">
          {isLastStep
            ? 'Every step is done for this period.'
            : `You're ready for the next step${nextStepLabel ? `: ${nextStepLabel}` : ''}.`}
        </p>
        <Button
          size="lg"
          onClick={onAdvance}
          className="h-12 w-full text-base font-semibold bg-indigo-600 hover:bg-indigo-700 shadow-md ring-2 ring-indigo-200 ring-offset-2"
        >
          {isLastStep ? finishLabel : continueLabel}
          {!isLastStep && <ArrowRight className="ml-2 h-5 w-5" />}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-indigo-50 px-6 py-8 sm:px-10 sm:py-10 shadow-sm">
      <div className="flex flex-col items-center text-center sm:flex-row sm:text-left sm:items-center sm:justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 min-w-0">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            {isLastStep ? (
              <PartyPopper className="h-7 w-7 text-emerald-600" />
            ) : (
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1">
              Step complete
            </p>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
              {currentStepLabel} is done
            </h3>
            <p className="text-sm sm:text-base text-slate-600 mt-1 max-w-lg">
              {isLastStep
                ? 'All reconciliation steps are finished for this period.'
                : `Nothing left here — move on to ${nextStepLabel ?? 'the next step'}.`}
            </p>
          </div>
        </div>
        <Button
          size="lg"
          onClick={onAdvance}
          className="h-12 shrink-0 px-8 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 shadow-md ring-2 ring-indigo-200 ring-offset-2 w-full sm:w-auto"
        >
          {isLastStep ? finishLabel : continueLabel}
          {!isLastStep && <ArrowRight className="ml-2 h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
}
