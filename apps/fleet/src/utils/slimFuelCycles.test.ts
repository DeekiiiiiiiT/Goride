import { describe, expect, it } from 'vitest';
import { hydrateFuelCyclesFromEntries, toSlimFuelCycle, toSlimFuelCycles } from './slimFuelCycles';
import type { FuelCycle, FuelEntry, SlimFuelCycle } from '../types/fuel';

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

describe('hydrateFuelCyclesFromEntries', () => {
  const entries = [
    { id: 'a', vehicleId: '5179KZ', date: '2026-06-15', liters: 10, amount: 2000, type: 'Gas_Card', metadata: { volumeContributed: 8 } },
    { id: 'b', vehicleId: '5179KZ', date: '2026-06-17', liters: 26, amount: 5000, type: 'Gas_Card' },
  ] as FuelEntry[];

  it('joins transactionIds to entries for Full Tanks UI', () => {
    const slim: SlimFuelCycle = {
      id: 'cycle-1',
      vehicleId: '5179KZ',
      startDate: '2026-06-15',
      endDate: '2026-06-17',
      totalLiters: 36,
      totalCost: 7000,
      avgPricePerLiter: 194.44,
      distance: 400,
      efficiency: 11.1,
      status: 'Complete',
      resetType: 'Auto_Soft',
      transactionIds: ['a', 'b', 'missing'],
    };
    const [hydrated] = hydrateFuelCyclesFromEntries([slim], entries);
    expect(hydrated.transactions).toHaveLength(2);
    expect(hydrated.transactions[0].volumeContributed).toBe(8);
    expect(hydrated.transactions[1].volumeContributed).toBe(26);
    expect(hydrated.efficiency).toBe(11.1);
  });

  it('does not throw when cycles omit transactions (server slim shape)', () => {
    const slim = { id: 'x', vehicleId: 'v', transactionIds: ['a'] } as SlimFuelCycle;
    expect(() => hydrateFuelCyclesFromEntries([slim], entries)).not.toThrow();
    expect(hydrateFuelCyclesFromEntries([slim], entries)[0].transactions[0].id).toBe('a');
  });

  it('returns empty for null/empty input', () => {
    expect(hydrateFuelCyclesFromEntries(null, entries)).toEqual([]);
    expect(hydrateFuelCyclesFromEntries([], entries)).toEqual([]);
  });
});
