import { describe, expect, it } from 'vitest';
import { pickFuelCyclesSource } from './useFuelCycles';
import type { FuelCycle } from '../types/fuel';

function cycle(partial: Partial<FuelCycle> & { id: string; status: FuelCycle['status'] }): FuelCycle {
  return {
    vehicleId: 'v1',
    startDate: '2026-08-24',
    endDate: '2026-08-26',
    totalLiters: 40,
    totalCost: 100,
    avgPricePerLiter: 2.5,
    transactions: [],
    distance: 400,
    efficiency: 10,
    resetType: 'Auto_Soft',
    ...partial,
  };
}

describe('pickFuelCyclesSource', () => {
  it('rejects Active-only server collapse when client has Complete cycles', () => {
    const server = [cycle({ id: 'active_v1', status: 'Active', distance: 2545, totalLiters: 241 })];
    const client = [
      cycle({ id: 'c1', status: 'Complete' }),
      cycle({ id: 'c2', status: 'Complete' }),
      cycle({ id: 'active_v1', status: 'Active', totalLiters: 20 }),
    ];
    const picked = pickFuelCyclesSource(server, client);
    expect(picked).toBe(client);
    expect(picked.filter((c) => c.status === 'Complete')).toHaveLength(2);
  });

  it('keeps server when it has Complete cycles', () => {
    const server = [cycle({ id: 's1', status: 'Complete' })];
    const client = [cycle({ id: 'c1', status: 'Complete' }), cycle({ id: 'c2', status: 'Complete' })];
    expect(pickFuelCyclesSource(server, client)).toBe(server);
  });
});
