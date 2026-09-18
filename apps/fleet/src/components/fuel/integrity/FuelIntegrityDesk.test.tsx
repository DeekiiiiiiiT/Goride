/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FuelIntegrityDesk } from './FuelIntegrityDesk';

describe('FuelIntegrityDesk', () => {
  it('switches between Fill flags and Stop-to-stop subtabs', async () => {
    const user = userEvent.setup();
    const onSubtab = vi.fn();
    render(
      <FuelIntegrityDesk
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
        subtab="fill-flags"
        onSubtabChange={onSubtab}
        rows={[]}
        vehicles={[{ id: '5179KZ', licensePlate: '5179KZ' } as any]}
        fuelEntries={[]}
        trips={[]}
        dateRange={undefined}
      />,
    );

    expect(screen.getByRole('button', { name: /fill flags/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /stop-to-stop/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /telematics/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /stop-to-stop/i }));
    expect(onSubtab).toHaveBeenCalledWith('stop-to-stop');
    await user.click(screen.getByRole('button', { name: /telematics/i }));
    expect(onSubtab).toHaveBeenCalledWith('telematics');
  });
});
