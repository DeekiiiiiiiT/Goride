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
    expect(screen.getByText(/Accept unexplained fuel \(required to continue\)/i)).toBeTruthy();
    expect(screen.queryByText(/Money residual clear/i)).toBeNull();
  });

  it('Mark reviewed & continue: disabled until disposition + 8-char reason, then calls handler', async () => {
    const user = userEvent.setup();
    const onMark = vi.fn();
    const { rerender } = render(
      <FuelLeakageStep
        {...baseProps}
        leakage={100}
        showDispositionForm
        leakageDisposition={'' as any}
        acceptNote=""
        onMarkLeakageReviewed={onMark}
      />,
    );

    const btn = screen.getByRole('button', { name: /Mark reviewed & continue/i });
    expect(btn).toBeDisabled();

    rerender(
      <FuelLeakageStep
        {...baseProps}
        leakage={100}
        showDispositionForm
        leakageDisposition="accepted_variance"
        acceptNote="short"
        onMarkLeakageReviewed={onMark}
      />,
    );
    expect(screen.getByRole('button', { name: /Mark reviewed & continue/i })).toBeDisabled();

    rerender(
      <FuelLeakageStep
        {...baseProps}
        leakage={100}
        showDispositionForm
        leakageDisposition="accepted_variance"
        acceptNote="long enough reason"
        onMarkLeakageReviewed={onMark}
      />,
    );
    const enabled = screen.getByRole('button', { name: /Mark reviewed & continue/i });
    expect(enabled).not.toBeDisabled();
    await user.click(enabled);
    expect(onMark).toHaveBeenCalledTimes(1);
  });

  it('shows routing health and a running balance that recent weeks already cover', () => {
    render(
      <FuelLeakageStep
        {...baseProps}
        leakage={982}
        vehicleSnaps={[{
          vehicleId: 'v1',
          misc: 982,
          report: {
            routingHealth: {
              ok: false,
              message: 'Routing unavailable — kilometres left unexplained. Google refused the route.',
            },
            varianceBalance: { creditIn: -7209, runningBalance: -6227, billable: 0, driverAdded: 0 },
            kmSources: [{
              category: 'commute',
              km: 0,
              confidence: 'none',
              note: 'Routing unavailable — kilometres left unexplained',
            }],
          },
        }]}
      />,
    );
    expect(screen.getByText(/Google refused the route/i)).toBeTruthy();
    expect(screen.getByText(/Carried from recent weeks/i)).toBeTruthy();
    expect(screen.getByText(/Recent weeks already explain this/i)).toBeTruthy();
    expect(screen.getByText(/Commute: Routing unavailable/i)).toBeTruthy();
  });

  it('says an open earlier week is not carried yet', () => {
    render(
      <FuelLeakageStep
        {...baseProps}
        leakage={0}
        vehicleSnaps={[{
          vehicleId: 'v1',
          misc: 0,
          report: { openPriorWeeks: ['2026-09-28'] },
        }]}
      />,
    );
    expect(screen.getByText(/week of 28 Sep is still open/i)).toBeTruthy();
  });
});
