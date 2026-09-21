/**
 * Finalize step panel — extracted from FuelPeriodWizard (Wave I hygiene).
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { FuelExceptionBlockersPanel } from './FuelExceptionBlockersPanel';
import { FuelUnapprovedTxBlockersPanel } from './FuelUnapprovedTxBlockersPanel';
import { FuelSettlementTable, type FuelSettlementRow } from './FuelSettlementTable';
import type {
  FuelExceptionBlocker,
  FuelUnapprovedTxBlocker,
} from '../../../utils/fuelFinalizeGating';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

export type FuelFinalizeStepProps = {
  periodLocked: boolean;
  exceptionBlockers: FuelExceptionBlocker[];
  unapprovedFuelTxBlockers?: FuelUnapprovedTxBlocker[];
  onOpenReviewQueue?: () => void;
  plateByVehicleId: Record<string, string>;
  exceptionBusyId: string | null;
  onAcceptException: (blocker: FuelExceptionBlocker, note: string) => Promise<void>;
  onEditFill?: (blocker: FuelExceptionBlocker) => void;
  hasBlockingWarnings: boolean;
  hasExceptionBlockers: boolean;
  hasUnapprovedFuelTxBlockers?: boolean;
  financeWarningAcknowledged: boolean;
  onFinanceWarningChange: (v: boolean) => void;
  needsSecondApprover: boolean;
  secondApproverThreshold: number;
  secondApproverConfirmed: boolean;
  secondApproveBusy: boolean;
  onRecordSecondApproval: () => void;
  /** human = distinct admin CTA; service_only = system stamps approve on Finalize. */
  dualApprovalUiMode?: 'human' | 'service_only';
  settlementRows: FuelSettlementRow[];
  /** Hard closable-gate reasons shown when Finalize is locked. */
  closableBlockMessages?: string[];
  /** Plain-English stop-to-stop summary above the Fix CTA. */
  stopToStopSummary?: string;
  /** Primary: open in-wizard Fix stop-to-stop remediation sheet. */
  onFixStopToStop?: () => void;
  /** @deprecated Prefer onFixStopToStop — kept for older callers. */
  onOpenStopToStopGapDetail?: () => void;
  /** Secondary: Open Fuel Integrity desk Stop-to-stop tab. */
  onOpenIntegrityStopToStop?: () => void;
  /** U-9: data provenance shown where the operator signs. */
  provenance?: {
    tripCount: number;
    tripsTimedOut?: boolean;
    deadheadTimedOut?: boolean;
    personalAllowanceTimedOut?: boolean;
    brainTimedOut?: boolean;
    fuelCardsLoaded: number;
    fuelCardsMissing?: boolean;
    vehicleCount: number;
  };
};

export function FuelFinalizeStep(props: FuelFinalizeStepProps) {
  const {
    periodLocked,
    exceptionBlockers,
    unapprovedFuelTxBlockers = [],
    onOpenReviewQueue,
    plateByVehicleId,
    exceptionBusyId,
    onAcceptException,
    onEditFill,
    hasBlockingWarnings,
    hasExceptionBlockers,
    hasUnapprovedFuelTxBlockers = false,
    financeWarningAcknowledged,
    onFinanceWarningChange,
    needsSecondApprover,
    secondApproverThreshold,
    secondApproverConfirmed,
    secondApproveBusy,
    onRecordSecondApproval,
    dualApprovalUiMode = 'human',
    settlementRows,
    closableBlockMessages = [],
    stopToStopSummary,
    onFixStopToStop,
    onOpenStopToStopGapDetail,
    onOpenIntegrityStopToStop,
    provenance,
  } = props;
  const serviceOnly = dualApprovalUiMode === 'service_only';
  const hasStopToStopBlock = closableBlockMessages.some((m) => {
    const lower = m.toLowerCase();
    return (
      lower.includes('stop-to-stop') ||
      lower.includes('over-log') ||
      lower.includes('trip/adjustment km') ||
      lower.includes('odometer readings between fills') ||
      lower.includes('fuel litres do not match')
    );
  });
  const fixStopToStop = onFixStopToStop || onOpenStopToStopGapDetail;

  return (
    <div className="space-y-3">
      {closableBlockMessages.length > 0 && (
        <div
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950"
          role="alert"
        >
          <p className="font-semibold">Finalize is blocked</p>
          {stopToStopSummary &&
          hasStopToStopBlock &&
          !/is clear/i.test(stopToStopSummary) ? (
            <p className="mt-1 text-rose-900">{stopToStopSummary}</p>
          ) : null}
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {closableBlockMessages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {hasStopToStopBlock && (fixStopToStop || onOpenIntegrityStopToStop) ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {fixStopToStop ? (
                <Button
                  type="button"
                  className="min-h-11 bg-rose-700 text-white hover:bg-rose-800"
                  onClick={fixStopToStop}
                >
                  Fix stop-to-stop blockers
                </Button>
              ) : null}
              {onOpenIntegrityStopToStop ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 text-rose-950 hover:bg-rose-100"
                  onClick={onOpenIntegrityStopToStop}
                >
                  Open in Fuel Integrity (advanced)
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {provenance && (
        <div
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800"
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold text-slate-900">Data provenance (signature)</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-700">
            <li>
              Trips: {provenance.tripCount}
              {provenance.tripsTimedOut ? ' (timed out — incomplete)' : ''}
            </li>
            <li>
              Deadhead:{' '}
              {provenance.deadheadTimedOut ? 'timed out — incomplete' : 'loaded'}
            </li>
            <li>
              Personal allowance:{' '}
              {provenance.personalAllowanceTimedOut ? 'timed out — incomplete' : 'loaded'}
            </li>
            <li>
              Fuel cards: {provenance.fuelCardsLoaded}
              {provenance.fuelCardsMissing ? ' (required cards missing)' : ''}
            </li>
            <li>Vehicles in scope: {provenance.vehicleCount}</li>
            {provenance.brainTimedOut ? <li>Fuel brain: timed out (legacy residual used)</li> : null}
          </ul>
        </div>
      )}
      <FuelUnapprovedTxBlockersPanel
        blockers={unapprovedFuelTxBlockers}
        onOpenReviewQueue={onOpenReviewQueue}
      />
      <FuelExceptionBlockersPanel
        blockers={exceptionBlockers}
        plateByVehicleId={plateByVehicleId}
        busyId={exceptionBusyId}
        onAcceptException={onAcceptException}
        onEditFill={onEditFill}
      />
      {hasBlockingWarnings && !hasExceptionBlockers && !hasUnapprovedFuelTxBlockers && (
        <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Checkbox
            checked={financeWarningAcknowledged}
            onCheckedChange={(v) => onFinanceWarningChange(!!v)}
            className="mt-0.5"
          />
          I reviewed data-quality and re-finalize warnings for this week.
        </label>
      )}
      {needsSecondApprover && !periodLocked ? (
        serviceOnly ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            Spend is above {formatFuelMoney(secondApproverThreshold)}. This organization uses{' '}
            <strong>system second approval</strong> on Finalize (you stay the finalizer).
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
            <p>
              Spend is above {formatFuelMoney(secondApproverThreshold)}. A{' '}
              <strong>different</strong> admin must record second approval before lock.
            </p>
            {secondApproverConfirmed ? (
              <p className="text-emerald-800">Distinct second approval is on file.</p>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={secondApproveBusy}
                onClick={onRecordSecondApproval}
              >
                {secondApproveBusy ? 'Recording…' : 'Record my second approval'}
              </Button>
            )}
          </div>
        )
      ) : null}
      {settlementRows.length > 0 && <FuelSettlementTable rows={settlementRows} showStatus />}
    </div>
  );
}
