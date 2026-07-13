import { describe, expect, it } from 'vitest';
import {
  driversForPolicy,
  driversForVersion,
  migrateVehiclePoliciesToDrivers,
  orphanDrivers,
} from './fuelPolicyAssignment';
import type { FuelScenario } from '../types/fuel';

const defaultPolicy: FuelScenario = {
  id: 'def',
  name: 'Default',
  isDefault: true,
  rules: [],
  versions: [
    {
      id: 'vd',
      effectiveFrom: '2000-01-03',
      rules: [],
      driverIds: [],
      createdAt: 'x',
    },
  ],
};

const customPolicy: FuelScenario = {
  id: 'custom',
  name: 'Custom',
  rules: [],
  versions: [
    {
      id: 'vc',
      effectiveFrom: '2026-01-12',
      rules: [],
      driverIds: ['d3'],
      createdAt: 'x',
    },
  ],
};

const drivers = [
  { id: 'd1', fuelScenarioId: undefined },
  { id: 'd2', fuelScenarioId: 'def' },
  { id: 'd3', fuelScenarioId: 'custom' },
  { id: 'd4', fuelScenarioId: 'missing' },
];

describe('fuelPolicyAssignment', () => {
  it('lists drivers from version.driverIds', () => {
    expect(driversForPolicy(customPolicy, drivers).map((d) => d.id)).toEqual(['d3']);
    expect(driversForPolicy(defaultPolicy, drivers)).toEqual([]);
    expect(driversForVersion(customPolicy.versions![0], drivers).map((d) => d.id)).toEqual(['d3']);
  });

  it('detects orphan fuelScenarioId values', () => {
    expect(orphanDrivers(drivers, [defaultPolicy, customPolicy]).map((d) => d.id)).toEqual(['d4']);
  });

  it('migrates vehicle policies onto drivers without an id', () => {
    const migrated = migrateVehiclePoliciesToDrivers(
      [
        { fuelScenarioId: 'custom', currentDriverId: 'd1' },
        { fuelScenarioId: 'custom', currentDriverId: 'd3' },
      ],
      drivers,
    );
    expect(migrated).toHaveLength(1);
    expect(migrated[0].id).toBe('d1');
    expect(migrated[0].fuelScenarioId).toBe('custom');
  });
});
