import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FuelEntry, FuelScenario } from '../types/fuel';
import type { Vehicle } from '../types/vehicle';
import { FuelCalculationService, type PersonalAllowanceReconContext } from '../services/fuelCalculationService';
import { DEFAULT_PERSONAL_ALLOWANCE } from './personalAllowance';

const mocks = vi.hoisted(() => ({
  getFleetDeadhead: vi.fn(),
  getTripsFiltered: vi.fn(),
}));

vi.mock('../services/api', () => ({
  api: {
    getFleetDeadhead: mocks.getFleetDeadhead,
    getTripsFiltered: mocks.getTripsFiltered,
  },
}));

vi.mock('../utils/fuelBrainFlags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/fuelBrainFlags')>();
  return {
    ...actual,
    FLEET_USE_FUEL_BRAIN: false,
    FUEL_BRAIN_SHADOW_COMPARE: false,
  };
});

import { buildFuelWeekReportsForFinalize } from './buildFuelWeekReportsForFinalize';

const scenario: FuelScenario = {
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
      driverIds: ['d1'],
      createdAt: 'x',
    },
  ],
};

const vehicle = {
  id: 'v1',
  licensePlate: '5179KZ',
  currentDriverId: 'd1',
  fuelSettings: { fuelType: 'Gasoline_87', efficiencyCity: 10, efficiencyHighway: 8, tankCapacity: 40 },
} as Vehicle;

const weekStartYmd = '2026-06-29';
const weekEndYmd = '2026-07-05';
const weekStart = new Date(2026, 5, 29);
const weekEnd = new Date(2026, 6, 5);

const entries: FuelEntry[] = [
  {
    id: 'e1',
    vehicleId: 'v1',
    driverId: 'd1',
    date: '2026-06-30',
    amount: 80,
    liters: 40,
    odometer: 1000,
    type: 'Card_Transaction',
    entryMode: 'Anchor',
    paymentSource: 'Gas_Card',
    reconciliationStatus: 'Pending',
  } as FuelEntry,
  {
    id: 'e2',
    vehicleId: 'v1',
    driverId: 'd1',
    date: '2026-07-03',
    amount: 80,
    liters: 40,
    odometer: 1400,
    type: 'Card_Transaction',
    entryMode: 'Anchor',
    paymentSource: 'Gas_Card',
    reconciliationStatus: 'Pending',
  } as FuelEntry,
];

const pa: PersonalAllowanceReconContext = {
  config: DEFAULT_PERSONAL_ALLOWANCE,
  ledgerGrossByDriverId: new Map([['d1', 120000]]),
  bonusByDriverId: new Map(),
};

describe('buildFuelWeekReportsForFinalize parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFleetDeadhead.mockResolvedValue({ vehicles: [] });
    mocks.getTripsFiltered.mockResolvedValue({ data: [] });
  });

  it('matches generateDriverFleetReport for the same PA-enabled fixture', async () => {
    const trips = [
      {
        id: 't1',
        driverId: 'd1',
        vehicleId: 'v1',
        date: '2026-06-30',
        status: 'Completed',
        distance: 80,
      } as any,
    ];

    const direct = FuelCalculationService.generateDriverFleetReport(
      [vehicle],
      [{ id: 'd1', name: 'Driver' }],
      weekStart,
      weekEnd,
      trips,
      entries,
      [],
      [scenario],
      undefined,
      [],
      undefined,
      pa,
    );

    const built = await buildFuelWeekReportsForFinalize({
      weekStartYmd,
      weekEndYmd,
      vehicles: [vehicle],
      drivers: [{ id: 'd1', name: 'Driver' }],
      fuelEntries: entries,
      adjustments: [],
      scenarios: [scenario],
      fuelCards: [],
      trips,
      personalAllowance: pa,
    });

    expect(built.reports).toHaveLength(direct.length);
    const a = direct.find((r) => r.driverId === 'd1');
    const b = built.reports.find((r) => r.driverId === 'd1');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(b!.driverShare).toBeCloseTo(a!.driverShare, 2);
    expect(b!.companyShare).toBeCloseTo(a!.companyShare, 2);
    expect(b!.totalGasCardCost).toBeCloseTo(a!.totalGasCardCost, 2);
    expect(b!.metadata?.personalAllowance?.enabled).toBe(a!.metadata?.personalAllowance?.enabled);
  });

  it('fetches week trips when the caller passes an empty array', async () => {
    const fetched = [
      {
        id: 't-fetched',
        driverId: 'd1',
        vehicleId: 'v1',
        date: '2026-06-30',
        status: 'Completed',
        distance: 80,
      },
    ];
    mocks.getTripsFiltered.mockResolvedValue({ data: fetched });

    const built = await buildFuelWeekReportsForFinalize({
      weekStartYmd,
      weekEndYmd,
      vehicles: [vehicle],
      drivers: [{ id: 'd1', name: 'Driver' }],
      fuelEntries: entries,
      adjustments: [],
      scenarios: [scenario],
      fuelCards: [],
      trips: [],
      personalAllowance: pa,
    });

    expect(mocks.getTripsFiltered).toHaveBeenCalled();
    expect(built.trips).toHaveLength(1);
    expect(built.reports[0]?.rideShareCost).toBeGreaterThan(0);
  });
});
