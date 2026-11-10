/**
 * @vitest-environment jsdom
 *
 * Regression: picking a driver before the cash queue finished loading froze an
 * empty copy of them (no weeks, $0), so earlier weeks could never be chosen.
 * The amount screen must read the driver's weeks live and pick them up on load.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const cashState: {
  drivers: Array<Record<string, unknown>>;
  isLoading: boolean;
  isFetching: boolean;
} = { drivers: [], isLoading: true, isFetching: true };

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock('../../hooks/useCashCollection', () => ({
  CashGateError: class extends Error {},
  useCashCollection: () => ({
    pickerOpen: true,
    setPickerOpen: () => {},
    drivers: cashState.drivers,
    periodsFor: (d: { weeks: unknown[] }) => d.weeks,
    collect: vi.fn(),
    findDriver: (id: string) => cashState.drivers.find((d) => d.driverId === id),
    blockReasonForDriver: () => null,
    hasBlockedOutstanding: false,
    rawRows: [],
    isLoading: cashState.isLoading,
    isFetching: cashState.isFetching,
    refetch: vi.fn(),
  }),
}));

vi.mock('../drivers/LogCashPaymentModal', () => ({
  LogCashPaymentModal: (p: { periods: unknown[]; periodsLoading?: boolean; cashOwed: number }) => (
    <div data-testid="amount-screen">
      weeks:{p.periods.length} loading:{String(!!p.periodsLoading)} owed:{p.cashOwed}
    </div>
  ),
}));

import { LogCashQuickActionHost } from './LogCashQuickAction';

describe('Log cash amount screen reads weeks live', () => {
  it('shows earlier weeks once they load, even if the driver was picked first', () => {
    const roster = [{ id: 'kenny', name: 'Kenny Gregory Rattray' }];
    const props = { pickerOpen: true, onPickerOpenChange: () => {}, roster };
    const { rerender } = render(<LogCashQuickActionHost {...props} />);

    fireEvent.click(screen.getByText('Kenny Gregory Rattray'));
    expect(screen.getByTestId('amount-screen').textContent).toBe('weeks:0 loading:true owed:0');

    cashState.drivers = [
      {
        driverId: 'kenny',
        driverName: 'Kenny Gregory Rattray',
        totalOwed: 7600,
        weeks: [{ periodAnchor: '2026-11-02' }],
        blockedCount: 0,
      },
    ];
    cashState.isLoading = false;
    cashState.isFetching = false;
    rerender(<LogCashQuickActionHost {...props} />);

    expect(screen.getByTestId('amount-screen').textContent).toBe('weeks:1 loading:false owed:7600');
  });
});
