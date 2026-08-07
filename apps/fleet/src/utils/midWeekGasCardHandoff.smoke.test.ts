/**
 * Mid-week gas-card handoff smoke:
 * Assign A → Mon blank statement fill → reassign B Thu → Fri fill →
 * hydrate + weekly recon must keep Mon on A and Fri on B.
 */
import { describe, expect, it } from 'vitest';
import {
  applyFuelCardAssignmentChange,
  hydrateStatementsFromCards,
} from '@roam/roam-shared';
import { resolveFuelFillDriver } from './resolveFuelFillDriver';
import { FuelCalculationService } from '../services/fuelCalculationService';
import type { FuelCard, FuelEntry, FuelScenario } from '../types/fuel';

const weekStart = new Date('2026-07-06T00:00:00'); // Mon
const weekEnd = new Date('2026-07-12T23:59:59'); // Sun

const policy: FuelScenario = {
  id: 'def',
  name: 'Standard',
  isDefault: true,
  rules: [
    {
      id: 'r1',
      category: 'Fuel',
      coverageType: 'Percentage',
      coverageValue: 0,
      rideShareCoverage: 80,
      companyUsageCoverage: 100,
      deadheadCoverage: 50,
      personalCoverage: 0,
      miscCoverage: 50,
    },
  ],
  versions: [
    {
      id: 'vd',
      effectiveFrom: '2000-01-03',
      rules: [
        {
          id: 'r1',
          category: 'Fuel',
          coverageType: 'Percentage',
          coverageValue: 0,
          rideShareCoverage: 80,
          companyUsageCoverage: 100,
          deadheadCoverage: 50,
          personalCoverage: 0,
          miscCoverage: 50,
        },
      ],
      driverIds: ['driver-a', 'driver-b'],
      createdAt: 'x',
    },
  ],
};

describe('mid-week gas card handoff smoke', () => {
  it('Assign A → Mon fill → reassign B Thu → Fri fill → Mon stays on A', () => {
    // 1) Assign to Driver A (with prior empty inventory)
    let card: FuelCard = {
      id: 'card-x',
      cardNumber: '00002920RN2783',
      provider: 'JAA',
      status: 'Active',
      jaaCardType: 'rental',
    };
    const monAssignAt = '2026-07-06T08:00:00.000Z';
    card = {
      ...card,
      assignedDriverId: 'driver-a',
      assignmentHistory: applyFuelCardAssignmentChange(
        card,
        'driver-a',
        'Driver A',
        monAssignAt,
        { vehicleIdAtAssign: 'v1', vehicleLabelAtAssign: '5179KZ' },
      ),
    };
    expect(card.assignmentHistory).toHaveLength(1);
    expect(card.assignmentHistory![0].driverId).toBe('driver-a');

    // 2) Mon JAA statement row (blank driver — would wrongly stick to B without history)
    const monStmt: FuelEntry = {
      id: 'stmt-mon',
      date: '2026-07-07', // Tue of week is fine; use Mon for clarity
      time: '14:00:00',
      amount: 4000,
      liters: 20,
      cardId: 'card-x',
      type: 'Card_Transaction',
      entryMode: 'Floating',
      paymentSource: 'Gas_Card',
      entrySource: 'fuel-card',
      metadata: { importSource: 'jaa_raw', jaaRowKind: 'approved_fuel' },
    };
    // Re-stamp date Monday
    monStmt.date = '2026-07-06';

    // 3) Thu reassign to Driver B
    const thuAt = '2026-07-09T10:00:00.000Z';
    card = {
      ...card,
      assignedDriverId: 'driver-b',
      assignmentHistory: applyFuelCardAssignmentChange(
        card,
        'driver-b',
        'Driver B',
        thuAt,
        { vehicleIdAtAssign: 'v1', vehicleLabelAtAssign: '5179KZ' },
      ),
    };
    expect(card.assignmentHistory).toHaveLength(2);
    expect(card.assignedDriverId).toBe('driver-b');

    // 4) Fri fill (blank driver, after handoff)
    const friStmt: FuelEntry = {
      id: 'stmt-fri',
      date: '2026-07-10',
      time: '11:00:00',
      amount: 3500,
      liters: 17,
      cardId: 'card-x',
      type: 'Card_Transaction',
      entryMode: 'Floating',
      paymentSource: 'Gas_Card',
      entrySource: 'fuel-card',
      metadata: { importSource: 'jaa_raw', jaaRowKind: 'approved_fuel' },
    };

    // Late import hydrates from history (not live B for Mon)
    const hydrated = hydrateStatementsFromCards([monStmt, friStmt], [card]);
    expect(hydrated.find((e) => e.id === 'stmt-mon')?.driverId).toBe('driver-a');
    expect(hydrated.find((e) => e.id === 'stmt-fri')?.driverId).toBe('driver-b');

    // resolveFuelFillDriver path (blank driver + current assignee B)
    const monResolved = resolveFuelFillDriver({
      entry: { cardId: 'card-x', date: '2026-07-06', time: '14:00:00' },
      vehicles: [{ id: 'v1', currentDriverId: 'driver-b' }],
      fuelCards: [card],
    });
    expect(monResolved.driverId).toBe('driver-a');
    expect(monResolved.source).toBe('gas_card');

    const friResolved = resolveFuelFillDriver({
      entry: { cardId: 'card-x', date: '2026-07-10', time: '11:00:00' },
      vehicles: [{ id: 'v1', currentDriverId: 'driver-b' }],
      fuelCards: [card],
    });
    expect(friResolved.driverId).toBe('driver-b');

    // 5) Weekly recon split
    const vehicles = [
      {
        id: 'v1',
        licensePlate: '5179KZ',
        make: 'Toyota',
        model: 'Roomy',
        currentDriverId: 'driver-b',
        currentDriverName: 'Driver B',
        driverAssignmentHistory: [
          {
            driverId: 'driver-a',
            driverName: 'Driver A',
            assignedAt: '2026-07-06T00:00:00.000Z',
            unassignedAt: '2026-07-09T10:00:00.000Z',
          },
          {
            driverId: 'driver-b',
            driverName: 'Driver B',
            assignedAt: '2026-07-09T10:00:00.000Z',
          },
        ],
      } as any,
    ];

    const reports = FuelCalculationService.generateDriverFleetReport(
      vehicles,
      [
        { id: 'driver-a', fuelScenarioId: 'def', name: 'Driver A' },
        { id: 'driver-b', fuelScenarioId: 'def', name: 'Driver B' },
      ] as any,
      weekStart,
      weekEnd,
      [
        {
          id: 't1',
          driverId: 'driver-a',
          vehicleId: 'v1',
          date: '2026-07-06',
          status: 'Completed',
          distance: 100,
        } as any,
        {
          id: 't2',
          driverId: 'driver-b',
          vehicleId: 'v1',
          date: '2026-07-10',
          status: 'Completed',
          distance: 80,
        } as any,
      ],
      // Blank-driver statement rows as late import would land them before hydrate stamp —
      // weekly engine uses resolveFuelFillDriver with card history
      [
        {
          id: 'stmt-mon',
          date: '2026-07-06',
          time: '14:00:00',
          vehicleId: 'v1',
          // intentionally no driverId
          cardId: 'card-x',
          amount: 4000,
          liters: 20,
          type: 'Card_Transaction',
          entryMode: 'Floating',
          paymentSource: 'Gas_Card',
        },
        {
          id: 'stmt-fri',
          date: '2026-07-10',
          time: '11:00:00',
          vehicleId: 'v1',
          cardId: 'card-x',
          amount: 3500,
          liters: 17,
          type: 'Card_Transaction',
          entryMode: 'Floating',
          paymentSource: 'Gas_Card',
        },
      ],
      [],
      [policy],
      undefined,
      [card],
    );

    const a = reports.find((r) => r.driverId === 'driver-a');
    const b = reports.find((r) => r.driverId === 'driver-b');
    expect(a?.totalGasCardCost).toBe(4000);
    expect(b?.totalGasCardCost).toBe(3500);
  });
});
