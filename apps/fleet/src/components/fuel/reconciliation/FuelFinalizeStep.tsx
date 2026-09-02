/**
 * Finalize step panel — extracted from FuelPeriodWizard (Wave I hygiene).
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { FuelExceptionBlockersPanel } from './FuelExceptionBlockersPanel';
import { FuelSettlementTable, type FuelSettlementRow } from './FuelSettlementTable';
import type { FuelExceptionBlocker } from '../../../utils/fuelFinalizeGating';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

export type FuelFinalizeStepProps = {
  periodLocked: boolean;
  exceptionBlockers: FuelExceptionBlocker[];
  plateByVehicleId: Record<string, string>;
  exceptionBusyId: string | null;
  onAcceptException: (blocker: FuelExceptionBlocker, note: string) => Promise<void>;
  onEditFill?: (blocker: FuelExceptionBlocker) => void;
  hasBlockingWarnings: boolean;
  hasExceptionBlockers: boolean;
  financeWarningAcknowledged: boolean;
  onFinanceWarningChange: (v: boolean) => void;
  needsSecondApprover: boolean;
  secondApproverThreshold: number;
  secondApproverConfirmed: boolean;
  secondApproveBusy: boolean;
  onRecordSecondApproval: () => void;
  /** human = distinct admin CTA; service_only = system stamps approve on Finalize. */
  dualApprovalUiMode?: 'human' | 'service_only';
  onExportCsv: () => void;
  onDownloadEvidencePack: () => void;
  settlementRows: FuelSettlementRow[];
};

export function FuelFinalizeStep(props: FuelFinalizeStepProps) {
  const {
    periodLocked,
    exceptionBlockers,
    plateByVehicleId,
    exceptionBusyId,
    onAcceptException,
    onEditFill,
    hasBlockingWarnings,
    hasExceptionBlockers,
    financeWarningAcknowledged,
    onFinanceWarningChange,
    needsSecondApprover,
    secondApproverThreshold,
    secondApproverConfirmed,
    secondApproveBusy,
    onRecordSecondApproval,
    dualApprovalUiMode = 'human',
    onExportCsv,
    onDownloadEvidencePack,
    settlementRows,
  } = props;
  const serviceOnly = dualApprovalUiMode === 'service_only';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={onExportCsv}>
          Export CSV
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onDownloadEvidencePack}>
          Download evidence pack
        </Button>
      </div>
      <FuelExceptionBlockersPanel
        blockers={exceptionBlockers}
        plateByVehicleId={plateByVehicleId}
        busyId={exceptionBusyId}
        onAcceptException={onAcceptException}
        onEditFill={onEditFill}
      />
      {hasBlockingWarnings && !hasExceptionBlockers && (
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
