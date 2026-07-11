import { describe, expect, it } from 'vitest';
import { orphanVehicles, vehiclesForPolicy } from './fuelPolicyAssignment';
import type { FuelScenario } from '../types/fuel';

const defaultPolicy: FuelScenario = {
  id: 'def',
  name: 'Default',
  isDefault: true,
  rules: [],
};

const customPolicy: FuelScenario = {
  id: 'custom',
  name: 'Owner',
  isDefault: false,
  rules: [],
};

describe('policy vehicle assignment mappers', () => {
  const vehicles = [
    { id: 'v1', fuelScenarioId: undefined },
    { id: 'v2', fuelScenarioId: 'def' },
    { id: 'v3', fuelScenarioId: 'custom' },
    { id: 'v4', fuelScenarioId: 'missing' },
  ];

  it('maps default policy to unset and explicit default ids', () => {
    const onDefault = vehiclesForPolicy(defaultPolicy, vehicles);
    expect(onDefault.map((v) => v.id).sort()).toEqual(['v1', 'v2']);
  });

  it('maps custom policy to explicit id only', () => {
    expect(vehiclesForPolicy(customPolicy, vehicles).map((v) => v.id)).toEqual(['v3']);
  });

  it('detects orphan fuelScenarioId values', () => {
    expect(orphanVehicles(vehicles, [defaultPolicy, customPolicy]).map((v) => v.id)).toEqual(['v4']);
  });
});
