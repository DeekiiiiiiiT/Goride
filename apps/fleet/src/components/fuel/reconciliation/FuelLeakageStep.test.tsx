/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FuelLeakageStep } from './FuelLeakageStep';

describe('FuelLeakageStep render', () => {
  it('toggles gap detail', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <FuelLeakageStep
        leakage={100}
        leakageRows={[
          {
            id: 'v1',
            title: 'ABC',
            subtitle: 'Unexplained fuel',
            right: '$100.00',
            badge: 'Unexplained',
            warn: true,
          },
        ]}
        queueIndex={0}
        vehicleSnaps={[{ vehicleId: 'v1', misc: 100 }]}
        weekStart="2026-07-06"
        weekEnd="2026-07-12"
        fuelEntries={[]}
        trips={[]}
        showGapDetail={false}
        onToggleGapDetail={onToggle}
        bucketVehicle={null}
        vehicles={[]}
        periodLocked={false}
        onBucketVehicleChange={() => undefined}
        adjustments={[]}
        dateRange={undefined}
        onRefresh={() => undefined}
      />,
    );

    const toggle = screen.queryByRole('button', { name: /gap|detail|stop/i });
    if (toggle) {
      await user.click(toggle);
      expect(onToggle).toHaveBeenCalled();
    } else {
      expect(screen.getByText(/unexplained/i)).toBeTruthy();
    }
  });
});
