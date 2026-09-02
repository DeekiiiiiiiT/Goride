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
    onExportCsv,
    onDownloadEvidencePack,
    settlementRows,
  } = props;

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
      {needsSecondApprover && !periodLocked && (
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
      )}
      {settlementRows.length > 0 && <FuelSettlementTable rows={settlementRows} showStatus />}
    </div>
  );
}
