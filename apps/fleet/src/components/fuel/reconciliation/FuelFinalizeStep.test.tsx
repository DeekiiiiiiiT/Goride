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
        settlementRows={[]}
      />,
    );
    expect(screen.getByText(/organization uses/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Record my second approval$/i })).toBeNull();
    unmount();
  });

  it('shows primary Fix stop-to-stop blockers and demotes Integrity', async () => {
    const user = userEvent.setup();
    const onFix = vi.fn();
    const onIntegrity = vi.fn();
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
        needsSecondApprover={false}
        secondApproverThreshold={50000}
        secondApproverConfirmed={false}
        secondApproveBusy={false}
        onRecordSecondApproval={() => undefined}
        settlementRows={[]}
        closableBlockMessages={[
          'Blocked — trip/adjustment km exceed odometer movement (OVER-LOG)',
          'Blocked — odometer readings between fills look wrong or out of order',
        ]}
        stopToStopSummary="3 fill windows on 5179KZ have trip/adjustment km larger than the odometer moved."
        onFixStopToStop={onFix}
        onOpenIntegrityStopToStop={onIntegrity}
      />,
    );

    expect(screen.getByText(/3 fill windows on 5179KZ/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Fix stop-to-stop blockers/i }));
    expect(onFix).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /Open in Fuel Integrity \(advanced\)/i }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open stop-to-stop gap detail/i })).toBeNull();
  });
});
