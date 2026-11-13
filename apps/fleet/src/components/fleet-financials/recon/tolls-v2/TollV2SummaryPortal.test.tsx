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
});
