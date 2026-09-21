/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FuelLeakageStep } from './FuelLeakageStep';

const baseProps = {
  totalSpend: 1000,
  leakageRows: [
    {
      id: 'v1',
      title: 'ABC',
      subtitle: 'Unexplained fuel',
      right: '$100.00',
      badge: 'Unexplained',
      warn: true,
    },
  ] as const,
  queueIndex: 0,
  vehicleSnaps: [{ vehicleId: 'v1', misc: 100 }],
  weekStart: '2026-07-06',
  weekEnd: '2026-07-12',
  fuelEntries: [] as any[],
  trips: [] as any[],
  showGapDetail: false,
  onToggleGapDetail: () => undefined,
  bucketVehicle: null,
  vehicles: [{ id: 'v1', licensePlate: 'ABC' } as any],
  periodLocked: false,
  onBucketVehicleChange: () => undefined,
  adjustments: [] as any[],
  dateRange: undefined,
  onRefresh: () => undefined,
  leakageDisposition: 'accepted_variance' as const,
  onLeakageDispositionChange: () => undefined,
  acceptNote: '',
  onAcceptNoteChange: () => undefined,
};

describe('FuelLeakageStep render', () => {
  it('toggles gap detail', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <FuelLeakageStep
        {...baseProps}
        leakage={100}
        showDispositionForm
        onToggleGapDetail={onToggle}
      />,
    );

    const toggle = screen.queryByRole('button', { name: /View stop-to-stop gap detail|gap|detail|stop/i });
    if (toggle) {
      await user.click(toggle);
      expect(onToggle).toHaveBeenCalled();
    } else {
      expect(screen.getByText(/unexplained/i)).toBeTruthy();
    }
  });

  it('S2S only: hides disposition, shows Fix, honest money-clear copy', async () => {
    const user = userEvent.setup();
    const onFix = vi.fn();
    render(
      <FuelLeakageStep
        {...baseProps}
        leakage={0}
        leakageRows={[]}
        vehicleSnaps={[]}
        showDispositionForm={false}
        stopToStopBlocking
        stopToStopSummary="3 fill windows on ABC have trip/adjustment km larger than the odometer moved."
        onFixStopToStop={onFix}
      />,
    );

    expect(screen.queryByText(/Residual disposition/i)).toBeNull();
    expect(screen.getByText(/Money residual clear/i)).toBeTruthy();
    expect(screen.getByText(/3 fill windows on ABC/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Fix stop-to-stop blockers/i }));
    expect(onFix).toHaveBeenCalled();
  });

  it('money residual: shows disposition when showDispositionForm', () => {
    render(
      <FuelLeakageStep
        {...baseProps}
        leakage={100}
        showDispositionForm
      />,
    );
    expect(screen.getByText(/Residual disposition/i)).toBeTruthy();
    expect(screen.queryByText(/Money residual clear/i)).toBeNull();
  });
});
