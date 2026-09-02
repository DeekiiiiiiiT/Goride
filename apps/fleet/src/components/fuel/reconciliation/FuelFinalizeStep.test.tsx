/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FuelFinalizeStep } from './FuelFinalizeStep';

describe('FuelFinalizeStep render', () => {
  it('shows second-approver UI and records approval', async () => {
    const user = userEvent.setup();
    const onRecord = vi.fn();
    render(
      <FuelFinalizeStep
        periodLocked={false}
        exceptionBlockers={[]}
        plateByVehicleId={{}}
        exceptionBusyId={null}
        onAcceptException={async () => undefined}
        hasBlockingWarnings={false}
        hasExceptionBlockers={false}
        financeWarningAcknowledged={false}
        onFinanceWarningChange={() => undefined}
        needsSecondApprover
        secondApproverThreshold={50_000}
        secondApproverConfirmed={false}
        secondApproveBusy={false}
        onRecordSecondApproval={onRecord}
        onExportCsv={() => undefined}
        onDownloadEvidencePack={() => undefined}
        settlementRows={[]}
      />,
    );

    expect(screen.getByText(/different/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /second approval/i }));
    expect(onRecord).toHaveBeenCalled();
  });

  it('service_only mode hides human second-approve CTA', () => {
    const { unmount } = render(
      <FuelFinalizeStep
        periodLocked={false}
        exceptionBlockers={[]}
        plateByVehicleId={{}}
        exceptionBusyId={null}
        onAcceptException={async () => undefined}
        hasBlockingWarnings={false}
        hasExceptionBlockers={false}
        financeWarningAcknowledged={false}
        onFinanceWarningChange={() => undefined}
        needsSecondApprover
        secondApproverThreshold={50_000}
        secondApproverConfirmed={false}
        secondApproveBusy={false}
        dualApprovalUiMode="service_only"
        onRecordSecondApproval={() => undefined}
        onExportCsv={() => undefined}
        onDownloadEvidencePack={() => undefined}
        settlementRows={[]}
      />,
    );
    expect(screen.getByText(/organization uses/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Record my second approval$/i })).toBeNull();
    unmount();
  });
});
