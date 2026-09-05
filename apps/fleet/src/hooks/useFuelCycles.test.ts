import { describe, expect, it, vi, afterEach } from 'vitest';
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses client when server is Active-only and client found Completes', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const server = [cycle({ id: 'active_v1', status: 'Active', distance: 2545, totalLiters: 241 })];
    const client = [
      cycle({ id: 'c1', status: 'Complete' }),
      cycle({ id: 'c2', status: 'Complete' }),
      cycle({ id: 'active_v1', status: 'Active', totalLiters: 20 }),
    ];
    expect(pickFuelCyclesSource(server, client)).toBe(client);
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('under-reports Completes'),
      expect.any(Object),
    );
  });

  it('uses client when client found more Completes than server', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
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
    expect(pickFuelCyclesSource(server, client)).toBe(client);
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('under-reports Completes'),
      expect.any(Object),
    );
  });

  it('keeps server when it has at least as many Completes as client', () => {
    const server = [
      cycle({ id: 's1', status: 'Complete' }),
      cycle({ id: 's2', status: 'Complete' }),
    ];
    const client = [cycle({ id: 'c1', status: 'Complete' })];
    expect(pickFuelCyclesSource(server, client)).toBe(server);
  });

  it('falls back to client when server is null (fetch failed)', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const client = [cycle({ id: 'c1', status: 'Complete' })];
    expect(pickFuelCyclesSource(null, client)).toBe(client);
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('server fetch failed'),
    );
  });

  it('falls back to client when legacy flag is set', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const server = [cycle({ id: 's1', status: 'Complete' })];
    const client = [cycle({ id: 'c1', status: 'Complete' })];
    expect(pickFuelCyclesSource(server, client, { legacy: true })).toBe(client);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('legacy'));
  });

  it('falls back to client when enabled is false', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const server = [cycle({ id: 's1', status: 'Complete' })];
    const client = [cycle({ id: 'c1', status: 'Complete' })];
    expect(pickFuelCyclesSource(server, client, { enabled: false })).toBe(client);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('disabled'));
  });
});
