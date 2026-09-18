/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FuelFlagsDesk } from './FuelFlagsDesk';
import type { FuelFlagDeskRow } from '../../../utils/fuelFillFlagClassify';
import type { FuelEntry } from '../../../types/fuel';
import { formatFuelLogDate } from '../logs/fuelLogDisplay';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function makeRow(overrides: {
  entryId: string;
  plate?: string;
  dateYmd?: string;
}): FuelFlagDeskRow {
  const dateYmd = overrides.dateYmd || '2026-09-08';
  const entry = {
    id: overrides.entryId,
    vehicleId: overrides.plate || '5179KZ',
    amount: 40,
    liters: 20,
    date: `${dateYmd}T12:00:00.000Z`,
    location: 'Test Station',
    paymentSource: 'Cash',
    metadata: {},
  } as FuelEntry;
  return {
    entryId: overrides.entryId,
    dateYmd,
    categories: ['Integrity'],
    reasons: [
      {
        code: 'integrity_warning',
        label: 'Integrity warning',
        category: 'Integrity',
        severity: 'warning',
      },
    ],
    primarySeverity: 'warning',
    isFlagged: true,
    hasOpenCritical: false,
    cleared: false,
    status: 'open',
    plate: overrides.plate || '5179KZ',
    driverName: 'Test Driver',
    entry,
  };
}

describe('FuelFlagsDesk bulk disposition (R5-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps failed rows selected after partial bulk accept', async () => {
    const user = userEvent.setup();
    const rowA = makeRow({ entryId: 'entry-a', dateYmd: '2026-09-08' });
    const rowB = makeRow({ entryId: 'entry-b', dateYmd: '2026-09-09' });
    const onAcceptFlag = vi.fn(async (row: FuelFlagDeskRow) => {
      if (row.entryId === 'entry-b') throw new Error('save failed');
    });

    render(
      <FuelFlagsDesk
        periods={[
          {
            weekStart: '2026-09-07',
            weekEnd: '2026-09-13',
            label: 'Sep 7 – Sep 13',
            locked: false,
          },
        ]}
        selectedWeekStart="2026-09-07"
        onSelectWeekStart={() => undefined}
        rows={[rowA, rowB]}
        canDisposition
        canAcceptCritical
        onAcceptFlag={onAcceptFlag}
        embeddedInShell
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /select all open flags/i }));
    await user.click(screen.getByRole('button', { name: /accept selected \(2\)/i }));

    await waitFor(() => {
      expect(onAcceptFlag).toHaveBeenCalledTimes(2);
    });

    const labelA = `Select 5179KZ ${formatFuelLogDate('2026-09-08')}`;
    const labelB = `Select 5179KZ ${formatFuelLogDate('2026-09-09')}`;
    expect(screen.getByRole('checkbox', { name: labelA })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('checkbox', { name: labelB })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(/1 selected/i)).toBeTruthy();
  });
});
