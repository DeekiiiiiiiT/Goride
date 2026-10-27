/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FuelGapAttribution } from './FuelGapAttribution';

describe('FuelGapAttribution', () => {
  it('excludes declined JAA rows from missing-odometer fill count', () => {
    render(
      <FuelGapAttribution
        vehicleId="v1"
        plate="5179KZ"
        misc={3625.06}
        weekStart="2026-09-14"
        weekEnd="2026-09-20"
        fuelEntries={[
          {
            id: 'declined-a',
            vehicleId: 'v1',
            date: '2026-09-16',
            amount: 7001.7,
            odometer: null,
            paymentSource: 'gas_card',
            entrySource: 'gas_card_import',
            metadata: {
              importSource: 'jaa_raw',
              jaaRowKind: 'declined',
              countsInFuelSpend: false,
            },
          },
          {
            id: 'declined-b',
            vehicleId: 'v1',
            date: '2026-09-16',
            amount: 7001.7,
            odometer: null,
            paymentSource: 'gas_card',
            entrySource: 'gas_card_import',
            metadata: {
              importSource: 'jaa_raw',
              jaaRowKind: 'declined',
              countsInFuelSpend: false,
            },
          },
        ] as any[]}
      />,
    );

    expect(screen.queryByText(/fill\(s\) missing odometer/i)).toBeNull();
    expect(screen.getByText(/5179KZ/)).toBeTruthy();
  });

  it('counts approved fills missing odometer', () => {
    render(
      <FuelGapAttribution
        vehicleId="v1"
        plate="ABC123"
        misc={100}
        weekStart="2026-09-14"
        weekEnd="2026-09-20"
        fuelEntries={[
          {
            id: 'approved',
            vehicleId: 'v1',
            date: '2026-09-15',
            amount: 4000,
            odometer: null,
            paymentSource: 'gas_card',
            entrySource: 'driver_app',
            metadata: { jaaRowKind: 'approved' },
          },
        ] as any[]}
      />,
    );

    expect(screen.getByText(/1 fill\(s\) missing odometer/i)).toBeTruthy();
  });
});
