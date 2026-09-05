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

  it('rejects server Anomaly+Active when client found more Completes', () => {
    const server = [
      cycle({
        id: 'mega',
        status: 'Anomaly',
        signalTier: 'exception',
        startDate: '2026-08-02',
        endDate: '2026-08-18',
        distance: 4415,
      }),
      cycle({ id: 'one', status: 'Complete', startDate: '2026-08-18', endDate: '2026-08-19' }),
      cycle({
        id: 'open',
        status: 'Active',
        startDate: '2026-08-19',
        endDate: '2026-08-22',
        distance: 1085,
      }),
    ];
    const client = [
      cycle({ id: 'c1', status: 'Complete', startDate: '2026-08-18', endDate: '2026-08-19' }),
      cycle({ id: 'c2', status: 'Complete', startDate: '2026-08-19', endDate: '2026-08-20' }),
      cycle({ id: 'c3', status: 'Complete', startDate: '2026-08-20', endDate: '2026-08-21' }),
      cycle({ id: 'c4', status: 'Complete', startDate: '2026-08-21', endDate: '2026-08-25' }),
    ];
    const picked = pickFuelCyclesSource(server, client);
    expect(picked).toBe(client);
    expect(picked.filter((c) => c.status === 'Complete')).toHaveLength(4);
  });

  it('keeps server when Complete counts match or exceed client', () => {
    const server = [
      cycle({ id: 's1', status: 'Complete' }),
      cycle({ id: 's2', status: 'Complete' }),
    ];
    const client = [cycle({ id: 'c1', status: 'Complete' })];
    expect(pickFuelCyclesSource(server, client)).toBe(server);
  });
});
