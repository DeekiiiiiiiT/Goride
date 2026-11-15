/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, within } from '@testing-library/react';
import React from 'react';
import { TollV2SummaryPortal } from './TollV2SummaryPortal';
import type { TollV2Charge } from './types';

describe('TollV2SummaryPortal', () => {
  const target = document.createElement('div');

  it('shows driver name from charges, not id', () => {
    document.body.appendChild(target);
    const charges: TollV2Charge[] = [
      {
        id: 'c1',
        version: 1,
        section: 'suggested',
        state: 'pending',
        amountMinor: 100,
        openMinor: 100,
        driverId: 'testcopy-driver-fleet-row',
        driverName: 'Kenny Gregory Rattray',
      },
    ];
    render(
      <TollV2SummaryPortal
        target={target}
        charges={charges}
        onGoToTagAccount={() => {}}
        result={{
          spend: { totalMinor: 0 },
          bearers: { platformMinor: 0, driverMinor: 0, fleetMinor: 0 },
          drivers: [{ driverId: 'testcopy-driver-fleet-row', owesFleetMinor: 27500 }],
          tagAccount: {
            openingMinor: 0,
            topUpsMinor: 500000,
            usageMinor: 425000,
            closingMinor: 75000,
          },
        }}
      />,
    );
    const view = within(target);
    expect(view.getByTestId('toll-driver-name-testcopy-driver-fleet-row').textContent).toBe(
      'Kenny Gregory Rattray',
    );
    expect(view.getByText('Opening')).toBeTruthy();
    expect(view.getByText('+ Top-ups')).toBeTruthy();
    expect(view.getByText('− Usage')).toBeTruthy();
    expect(view.getByText('= Closing')).toBeTruthy();
    document.body.removeChild(target);
  });

  const week28SepResult = {
    spend: { totalMinor: 175500 },
    bearers: { platformMinor: 175500, driverMinor: 0, fleetMinor: 0 },
    drivers: [],
    // Toll week result sums files from zero: wrong opening / closing (WRA-57).
    tagAccount: { openingMinor: -59500, topUpsMinor: 500000, usageMinor: 175500, closingMinor: 265000 },
  };

  it("WRA-57: shows step 4's roll (opening 5,969 → closing 9,214), not the toll week result", () => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    render(
      <TollV2SummaryPortal
        target={box}
        charges={[]}
        onGoToTagAccount={() => {}}
        result={week28SepResult}
        roll={{ openingMinor: 596900, topUpsMinor: 500000, usageMinor: 175500, closingMinor: 921400 }}
      />,
    );
    const view = within(box);
    expect(view.getByTestId('toll-tag-opening').textContent).toContain('5,969.00');
    expect(view.getByTestId('toll-tag-closing').textContent).toContain('9,214.00');
    expect(view.queryByText(/2,650/)).toBeNull();
    document.body.removeChild(box);
  });

  it('WRA-57: while step 4 is loading the box shows dashes, never the toll week result', () => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    render(
      <TollV2SummaryPortal target={box} charges={[]} onGoToTagAccount={() => {}} result={week28SepResult} roll={null} />,
    );
    const view = within(box);
    expect(view.getByTestId('toll-tag-opening').textContent).toBe('—');
    expect(view.getByTestId('toll-tag-closing').textContent).toBe('—');
    document.body.removeChild(box);
  });
});
