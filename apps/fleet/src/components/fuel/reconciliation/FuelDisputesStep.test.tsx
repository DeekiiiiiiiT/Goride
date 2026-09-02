/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FuelDisputesStep } from './FuelDisputesStep';
import type { FuelDispute } from '../../../types/fuel';

describe('FuelDisputesStep render', () => {
  it('calls onResolveDispute when Resolve is clicked', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    const dispute = {
      id: 'd1',
      reason: 'Wrong amount',
      vehicleId: 'v1',
      weekStart: '2026-07-06',
      driverId: 'dr1',
      createdAt: '2026-07-07T00:00:00Z',
      description: 'x',
      status: 'Open',
    } as FuelDispute;

    render(
      <FuelDisputesStep
        openDisputes={[dispute]}
        periodLocked={false}
        onResolveDispute={onResolve}
        onAddAdjustment={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: /resolve/i }));
    expect(onResolve).toHaveBeenCalledWith(dispute);
  });
});
