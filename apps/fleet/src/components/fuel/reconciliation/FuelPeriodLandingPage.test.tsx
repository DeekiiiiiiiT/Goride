/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FuelPeriodLandingPage } from './FuelPeriodLandingPage';
import { emptyFuelStepCounts } from '../../../utils/fuelPeriodGating';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';

function period(partial: Partial<FuelReconciliationPeriod>): FuelReconciliationPeriod {
  return {
    id: 'w1',
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    label: 'Jul 6 – Jul 12',
    status: 'outstanding',
    locked: false,
    vehicleCount: 1,
    totalSpend: 60_000,
    netLeakage: 0,
    companyShare: 30_000,
    driverShare: 30_000,
    actionableTotal: 0,
    exceptionCount: 0,
    counts: emptyFuelStepCounts(),
    ...partial,
  };
}

describe('FuelPeriodLandingPage auto-close badges', () => {
  it('shows needs second approval for high-spend clean weeks', () => {
    render(
      <FuelPeriodLandingPage
        outstanding={[period({})]}
        inProgress={[]}
        completed={[]}
        loading={false}
        onSelectPeriod={() => undefined}
        secondApproverThreshold={50_000}
        weeksWithSnapshots={new Set(['2026-07-06'])}
      />,
    );
    expect(screen.getByText(/needs second approval/i)).toBeTruthy();
  });

  it('shows eligible when money week lacks client snapshots but under threshold', () => {
    render(
      <FuelPeriodLandingPage
        outstanding={[period({ totalSpend: 1_000 })]}
        inProgress={[]}
        completed={[]}
        loading={false}
        onSelectPeriod={() => undefined}
        secondApproverThreshold={0}
        weeksWithSnapshots={new Set()}
      />,
    );
    expect(screen.getByText(/eligible for auto-close/i)).toBeTruthy();
  });

  // ROAM-FLEET-V/T/S — prop must be in PeriodCard scope (not a free identifier)
  it('renders system-approval badge when dual mode is service_approve', () => {
    render(
      <FuelPeriodLandingPage
        outstanding={[period({ totalSpend: 60_000 })]}
        inProgress={[]}
        completed={[]}
        loading={false}
        onSelectPeriod={() => undefined}
        secondApproverThreshold={50_000}
        autoCloseDualApprovalMode="service_approve"
        weeksWithSnapshots={new Set(['2026-07-06'])}
      />,
    );
    expect(screen.getByText(/eligible for auto-close \(system approval\)/i)).toBeTruthy();
  });
});