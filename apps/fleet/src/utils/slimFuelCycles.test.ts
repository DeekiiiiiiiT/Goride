import { describe, expect, it } from 'vitest';
import { toSlimFuelCycle, toSlimFuelCycles } from './slimFuelCycles';
import type { FuelCycle } from '../types/fuel';

const sample: FuelCycle = {
  id: '11111111-1111-4111-8111-111111111111',
  vehicleId: '5179KZ',
  startDate: '2026-06-15',
  endDate: '2026-06-17',
  totalLiters: 36,
  totalCost: 7000,
  avgPricePerLiter: 194.44,
  transactions: [
    { id: 'a', vehicleId: '5179KZ', date: '2026-06-15', liters: 10, amount: 2000 } as any,
    { id: 'b', vehicleId: '5179KZ', date: '2026-06-17', liters: 26, amount: 5000 } as any,
  ],
  status: 'Complete',
  distance: 400,
  efficiency: 11.1,
  resetType: 'Auto_Soft',
  trustTier: 'Soft',
  isCapped: true,
  excessVolume: 2,
};

describe('toSlimFuelCycles', () => {
  it('drops embedded transactions and keeps transactionIds', () => {
    const slim = toSlimFuelCycle(sample);
    expect(slim).not.toHaveProperty('transactions');
    expect(slim.transactionIds).toEqual(['a', 'b']);
    expect(slim.id).toBe(sample.id);
    expect(slim.trustTier).toBe('Soft');
  });

  it('maps arrays and handles empty', () => {
    expect(toSlimFuelCycles([])).toEqual([]);
    expect(toSlimFuelCycles(undefined)).toEqual([]);
    expect(toSlimFuelCycles([sample])).toHaveLength(1);
  });
});
