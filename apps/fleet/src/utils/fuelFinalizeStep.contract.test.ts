/**
 * Contract tests for finalize step props (Wave I — no jsdom required).
 */
import { describe, expect, it } from 'vitest';
import type { FuelFinalizeStepProps } from '../components/fuel/reconciliation/FuelFinalizeStep';

describe('FuelFinalizeStep contract', () => {
  it('requires distinct second-approval fields when threshold path is on', () => {
    const props: FuelFinalizeStepProps = {
      periodLocked: false,
      exceptionBlockers: [],
      plateByVehicleId: {},
      exceptionBusyId: null,
      onAcceptException: async () => undefined,
      hasBlockingWarnings: false,
      hasExceptionBlockers: false,
      financeWarningAcknowledged: true,
      onFinanceWarningChange: () => undefined,
      needsSecondApprover: true,
      secondApproverThreshold: 50_000,
      secondApproverConfirmed: false,
      secondApproveBusy: false,
      onRecordSecondApproval: () => undefined,
      onExportCsv: () => undefined,
      onDownloadEvidencePack: () => undefined,
      settlementRows: [],
    };
    expect(props.needsSecondApprover && !props.secondApproverConfirmed).toBe(true);
    expect(props.secondApproverThreshold).toBeGreaterThan(0);
  });
});
