/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StopToStopRemediationSheet } from './StopToStopRemediationSheet';
import type { OdometerBucket } from '@roam/fuel-core';

vi.mock('../../../services/api', () => ({
  api: {
    acceptFuelPeriodStopToStopGaps: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { api } from '../../../services/api';

function makeBucket(partial: Partial<OdometerBucket> & Pick<OdometerBucket, 'id'>): OdometerBucket {
  return {
    vehicleId: 'v1',
    startOdometer: 1000,
    endOdometer: 1100,
    startDate: '2026-09-07',
    endDate: '2026-09-08',
    actualFuelLiters: 10,
    actualFuelCost: 100,
    associatedReceipts: [],
    closingEntryId: 'fill-end',
    totalTripDistance: 0,
    tripsCount: 0,
    expectedFuelLiters: 10,
    varianceLiters: 0,
    variancePercent: 0,
    rideShareDistance: 180,
    personalDistance: 0,
    companyMiscDistance: 0,
    unaccountedDistance: 80,
    status: 'Anomaly',
    ...partial,
  };
}

describe('StopToStopRemediationSheet', () => {
  beforeEach(() => {
    vi.mocked(api.acceptFuelPeriodStopToStopGaps).mockReset();
  });

  it('lists broken windows with Fix odometer / Review trips actions', async () => {
    const user = userEvent.setup();
    const onEditFill = vi.fn();
    const onReviewTrips = vi.fn();
    const onRecheck = vi.fn();
    render(
      <StopToStopRemediationSheet
        open
        onOpenChange={() => undefined}
        vehicleLabel="5179KZ"
        vehicleId="v1"
        buckets={[
          makeBucket({ id: 'b1' }),
          makeBucket({
            id: 'b2',
            chainAnomaly: true,
            confidenceTier: 'indeterminate',
            endOdometer: 900,
            unaccountedDistance: 0,
            rideShareDistance: 0,
          }),
        ]}
        fuelEntries={[
          {
            id: 'fill-end',
            vehicleId: 'v1',
            date: '2026-09-08',
            odometer: 1100,
          } as any,
        ]}
        onEditFill={onEditFill}
        onReviewAdjustments={() => undefined}
        onReviewTrips={onReviewTrips}
        onInspectTimeline={() => undefined}
        onRecheck={onRecheck}
      />,
    );

    expect(screen.getByText(/Fix stop-to-stop — 5179KZ/i)).toBeTruthy();
    expect(screen.getByText(/2 windows still blocking on this vehicle/i)).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: /Fix end odometer/i })[0]);
    expect(onEditFill).toHaveBeenCalled();

    const tripBtns = screen.getAllByRole('button', { name: /Review trips/i });
    await user.click(tripBtns[0]);
    expect(onReviewTrips).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Refresh data/i }));
    expect(onRecheck).toHaveBeenCalled();
  });

  it('disables accept checkbox for chain rows and bulk-accepts selected OVER-LOG', async () => {
    const user = userEvent.setup();
    const onRecheck = vi.fn();
    const onGapAcceptsChange = vi.fn();
    vi.mocked(api.acceptFuelPeriodStopToStopGaps).mockResolvedValue({
      stopToStopGapAccepts: [
        {
          bucketId: 'b1',
          vehicleId: 'v1',
          startOdometer: 1000,
          endOdometer: 1100,
          startDate: '2026-09-07',
          endDate: '2026-09-08',
          note: 'platform overstated trips ok',
        },
      ],
      version: 2,
    });

    render(
      <StopToStopRemediationSheet
        open
        onOpenChange={() => undefined}
        vehicleLabel="5179KZ"
        vehicleId="v1"
        periodId="period-1"
        periodVersion={1}
        gapAccepts={[]}
        onGapAcceptsChange={onGapAcceptsChange}
        buckets={[
          makeBucket({ id: 'b1' }),
          makeBucket({
            id: 'b2',
            chainAnomaly: true,
            confidenceTier: 'indeterminate',
            endOdometer: 900,
            unaccountedDistance: 0,
            rideShareDistance: 0,
          }),
        ]}
        fuelEntries={[]}
        onEditFill={() => undefined}
        onReviewAdjustments={() => undefined}
        onReviewTrips={() => undefined}
        onInspectTimeline={() => undefined}
        onRecheck={onRecheck}
      />,
    );

    const chainBox = screen.getByRole('checkbox', { name: /Cannot accept — fix odometer/i });
    expect(chainBox).toBeDisabled();

    const overLogBox = screen.getByRole('checkbox', { name: /Select gap 1000 to 1100/i });
    await user.click(overLogBox);

    await user.click(screen.getByRole('button', { name: /Accept selected \(1\)/i }));
    const note = screen.getByLabelText(/Note \(required\)/i);
    await user.type(note, 'platform overstated trips ok');
    await user.click(screen.getByRole('button', { name: /Confirm accept/i }));

    await waitFor(() => {
      expect(api.acceptFuelPeriodStopToStopGaps).toHaveBeenCalled();
    });
    const call = vi.mocked(api.acceptFuelPeriodStopToStopGaps).mock.calls[0][0];
    expect(call.accepts).toHaveLength(1);
    expect(call.accepts[0].bucketId).toBe('b1');
    expect(onGapAcceptsChange).toHaveBeenCalled();
    expect(onRecheck).toHaveBeenCalled();
  });
});
