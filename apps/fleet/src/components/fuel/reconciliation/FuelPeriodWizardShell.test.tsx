/**
 * @vitest-environment jsdom
 * Wave 3 — CI-safe wizard shell chrome (no live stack).
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FuelPeriodWizardBodyGate,
  FuelPeriodWizardContinueFooter,
  FuelPeriodWizardHeader,
} from './FuelPeriodWizardShell';
import { FuelWizardStepHero } from './FuelWizardStepHero';
import { emptyFuelStepCounts } from '../../../utils/fuelPeriodGating';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';

const period: FuelReconciliationPeriod = {
  id: 'w1',
  startDate: '2026-07-06',
  endDate: '2026-07-12',
  label: 'Jul 6 – Jul 12',
  status: 'outstanding',
  locked: false,
  vehicleCount: 1,
  totalSpend: 12_000,
  netLeakage: 500,
  companyShare: 6_000,
  driverShare: 5_500,
  actionableTotal: 0,
  exceptionCount: 0,
  counts: emptyFuelStepCounts(),
};

describe('FuelPeriodWizard shell chrome', () => {
  it('shows Draft badge and Continue CTA', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <>
        <FuelPeriodWizardHeader period={period} periodLocked={false} onBack={() => undefined} />
        <FuelWizardStepHero
          title="Data quality"
          body="Confirm fills and odometer before disputes."
        />
        <FuelPeriodWizardContinueFooter
          isLast={false}
          canContinue
          activeStepId="data-quality"
          leakageReviewed={false}
          continueLabel="Continue"
          onContinue={onContinue}
        />
      </>,
    );
    expect(screen.getByText('Jul 6 – Jul 12')).toBeTruthy();
    expect(screen.getByText(/draft/i)).toBeTruthy();
    expect(screen.getByText('Data quality')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('shows Locked badge for locked weeks', () => {
    render(
      <FuelPeriodWizardHeader
        period={{ ...period, locked: true, status: 'completed' }}
        periodLocked
        onBack={() => undefined}
      />,
    );
    expect(screen.getByText(/locked/i)).toBeTruthy();
  });

  it('deep-link finalize step: last step hides Continue footer', () => {
    const { container } = render(
      <FuelPeriodWizardContinueFooter
        isLast
        canContinue={false}
        activeStepId="finalize"
        leakageReviewed
        continueLabel="Continue"
        onContinue={() => undefined}
      />,
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('empty body gate uses product copy', () => {
    render(
      <FuelPeriodWizardBodyGate
        loading={false}
        error={false}
        empty
        onRetry={() => undefined}
      >
        <div>should not show</div>
      </FuelPeriodWizardBodyGate>,
    );
    expect(screen.getByText(/no fuel spend for this week/i)).toBeTruthy();
    expect(screen.queryByText('should not show')).toBeNull();
  });
});
