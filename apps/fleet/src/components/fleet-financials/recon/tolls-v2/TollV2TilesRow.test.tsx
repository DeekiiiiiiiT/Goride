/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TollV2TilesRow } from './TollV2TilesRow';
import { TollV2SummaryPortal } from './TollV2SummaryPortal';
import type { TollV2DisputeResult, TollV2WeekResult } from './types';

const subcounts = {
  transactionCount: 15,
  verifiedMatchCount: 2,
  driverAssignedCount: 0,
  driverAssignedLabel: '0 assigned',
  fleetAbsorbedCount: 0,
  itemsRemainingCount: 0,
};

describe('earlier weeks disputes in the toll step', () => {
  it('Driver pays tile includes earlier disputes, with no extra text and no eye', () => {
    render(
      <TollV2TilesRow
        tiles={{
          spendMinor: 619000,
          platformMinor: 619000,
          driverMinor: 0,
          fleetMinor: 0,
          stillToDecideMinor: 0,
          tilesAddUp: true,
          earlierDriverMinor: 12000,
          earlierFleetMinor: 0,
        }}
        tilesAddUp
        subcounts={subcounts}
      />,
    );
    const tile = screen.getByTestId('toll-v2-tile-driver-pays');
    expect(tile.textContent).toContain('J$120.00');
    expect(tile.textContent).not.toMatch(/earlier/);
    expect(tile.querySelector('button')).toBeNull();
  });

  it('each driver in Driver toll charges has an eye that explains the charge', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const result = {
      drivers: [
        { driverId: 'kenny', owesFleetMinor: 12500, driverName: 'Kenny Gregory Rattray' },
        { driverId: 'other', owesFleetMinor: 500, driverName: 'Other Driver' },
      ],
    } as unknown as TollV2WeekResult;
    const row = (id: string, driverId: string, borneMinor: number, chargeWeekKey: string) =>
      ({ id, driverId, outcome: 'expired', bearer: 'driver', borneMinor, chargeWeekKey }) as unknown as TollV2DisputeResult;
    const results = [
      row('a', 'kenny', 2000, '2026-11-09'),
      row('b', 'kenny', 10000, '2026-11-09'),
      row('c', 'kenny', 999, '2026-11-16'), // this week's own dispute: not "earlier"
    ];
    render(
      <TollV2SummaryPortal
        target={target}
        result={result}
        charges={[]}
        onGoToTagAccount={() => {}}
        roll={null}
        results={results}
        weekKey="2026-11-16"
      />,
    );
    expect(screen.getByTestId('toll-driver-explain-other')).toBeTruthy();
    fireEvent.click(screen.getByTestId('toll-driver-explain-kenny'));
    const box = screen.getByTestId('toll-driver-explain');
    expect(box.textContent).toMatch(/Kenny Gregory Rattray · J\$125\.00/);
    expect(box.textContent).toMatch(/Tolls from this week\s*J\$5\.00/);
    expect(box.textContent).toMatch(/2 disputes from earlier weeks.*J\$120\.00/);
    expect(box.textContent).toMatch(/Total\s*J\$125\.00/);
  });
});
