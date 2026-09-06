import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FUEL_ECONOMY_KM_PER_L,
  economyFromVehicleRecord,
  resolveDriverFuelEconomyKmPerL,
  resolveFuelEconomyKmPerL,
} from './driverOpsDefaults';

describe('resolveFuelEconomyKmPerL', () => {
  it('returns positive finite values', () => {
    expect(resolveFuelEconomyKmPerL(14.5)).toBe(14.5);
  });

  it('falls back for missing or invalid', () => {
    expect(resolveFuelEconomyKmPerL(null)).toBe(DEFAULT_FUEL_ECONOMY_KM_PER_L);
    expect(resolveFuelEconomyKmPerL(0)).toBe(DEFAULT_FUEL_ECONOMY_KM_PER_L);
    expect(resolveFuelEconomyKmPerL(NaN)).toBe(DEFAULT_FUEL_ECONOMY_KM_PER_L);
  });
});

describe('economyFromVehicleRecord', () => {
  it('reads camelCase, snake_case, and nested catalog', () => {
    expect(economyFromVehicleRecord({ fuelEconomyKmPerL: 11 })).toBe(11);
    expect(economyFromVehicleRecord({ fuel_economy_km_per_l: 13 })).toBe(13);
    expect(
      economyFromVehicleRecord({ catalogId: 'c1', catalog: { fuel_economy_km_per_l: 15 } }),
    ).toBe(15);
  });

  it('returns null when absent', () => {
    expect(economyFromVehicleRecord({})).toBeNull();
    expect(economyFromVehicleRecord(null)).toBeNull();
  });
});

describe('resolveDriverFuelEconomyKmPerL', () => {
  it('uses first assigned vehicle with economy', () => {
    expect(
      resolveDriverFuelEconomyKmPerL([
        { id: 'a' },
        { id: 'b', fuel_economy_km_per_l: 16 },
      ]),
    ).toBe(16);
  });

  it('defaults when no vehicles have economy', () => {
    expect(resolveDriverFuelEconomyKmPerL([])).toBe(DEFAULT_FUEL_ECONOMY_KM_PER_L);
    expect(resolveDriverFuelEconomyKmPerL([{ id: 'x' }])).toBe(DEFAULT_FUEL_ECONOMY_KM_PER_L);
  });
});
