import { describe, expect, it } from 'vitest';
import {
  driversForPolicy,
  orphanDrivers,
  migrateVehiclePoliciesToDrivers,
} from './fuelPolicyAssignment';
import type { FuelScenario } from '../types/fuel';

const defaultPolicy: FuelScenario = {
  id: 'def',
  name: 'Default',
  isDefault: true,
  rules: [],
};

const customPolicy: FuelScenario = {
  id: 'custom',
  name: 'Quota Met',
  isDefault: false,
  rules: [],
};

describe('policy driver assignment mappers', () => {
  const drivers = [
    { id: 'd1', fuelScenarioId: undefined },
    { id: 'd2', fuelScenarioId: 'def' },
    { id: 'd3', fuelScenarioId: 'custom' },
    { id: 'd4', fuelScenarioId: 'missing' },
  ];

  it('maps default policy to unset and explicit default ids', () => {
    const onDefault = driversForPolicy(defaultPolicy, drivers);
    expect(onDefault.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
  });

  it('maps custom policy to explicit id only', () => {
    expect(driversForPolicy(customPolicy, drivers).map((d) => d.id)).toEqual(['d3']);
  });

  it('detects orphan fuelScenarioId values', () => {
    expect(orphanDrivers(drivers, [defaultPolicy, customPolicy]).map((d) => d.id)).toEqual(['d4']);
  });

  it('migrates vehicle policies onto current drivers when empty', () => {
    const vehicles = [
      { fuelScenarioId: 'custom', currentDriverId: 'd1' },
      { fuelScenarioId: 'custom', currentDriverId: 'd3' }, // already has custom — skip
    ];
    const migrated = migrateVehiclePoliciesToDrivers(vehicles, drivers);
    expect(migrated).toHaveLength(1);
    expect(migrated[0].id).toBe('d1');
    expect(migrated[0].fuelScenarioId).toBe('custom');
  });
});
