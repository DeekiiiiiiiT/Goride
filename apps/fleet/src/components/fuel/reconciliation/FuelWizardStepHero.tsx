/**
 * Step instruction hero — one job per step (extracted from FuelPeriodWizard).
 */
import React from 'react';
import { Button } from '../../ui/button';

export type FuelWizardStepHeroProps = {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
};

export function FuelWizardStepHero({
  title,
  body,
  actionLabel,
  onAction,
  actionDisabled,
}: FuelWizardStepHeroProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 border-l-4 border-l-[#3525cd] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{body}</p>
      </div>
      {actionLabel && onAction && (
        <Button
          type="button"
          className="min-h-11 shrink-0 bg-[#3525cd] text-white hover:bg-[#2a1ea4] sm:min-h-11"
          disabled={actionDisabled}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
