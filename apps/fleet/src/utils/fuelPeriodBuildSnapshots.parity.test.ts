/**
 * Golden shape for server-built finalize snapshots (mirrors Deno assembleSnapshotsFromEntries).
 */
import { describe, expect, it } from 'vitest';

/** Mirrors supabase/functions/_fleet-server/fuel_period_build_snapshots.ts settle pool mapping. */
function assembleFromEntries(
  entries: Array<Record<string, unknown>>,
  weekStart: string,
  weekEnd: string,
  orgId: string,
) {
  const byDriver = new Map<string, Record<string, unknown>[]>();
  for (const e of entries) {
    const driverId = String(e.driverId || `vehicle:${e.vehicleId}`);
    const list = byDriver.get(driverId) || [];
    list.push(e);
    byDriver.set(driverId, list);
  }
  const snaps = [];
  for (const [driverId, pool] of byDriver) {
    const total = pool.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    snaps.push({
      weekStart,
      weekEnd,
      driverId,
      totalGasCardCost: total,
      driverShare: total * 0.5,
      companyShare: total * 0.5,
      orgId,
      metadata: {
        settledEntries: pool.map((e) => ({
          id: e.id,
          amount: Number(e.amount) || 0,
          date: String(e.date).split('T')[0],
          driverId,
          vehicleId: e.vehicleId,
        })),
      },
    });
  }
  return snaps;
}

describe('Program 4 snapshot enrich parity (shape)', () => {
  it('builds settledEntries per driver for settle path', () => {
    const snaps = assembleFromEntries(
      [
        {
          id: 'e1',
          amount: 100,
          date: '2026-07-07',
          driverId: 'd1',
          vehicleId: 'v1',
          reconciliationStatus: 'Pending',
        },
        {
          id: 'e2',
          amount: 50,
          date: '2026-07-08',
          driverId: 'd1',
          vehicleId: 'v1',
          reconciliationStatus: 'Pending',
        },
      ],
      '2026-07-06',
      '2026-07-12',
      'org1',
    );
    expect(snaps).toHaveLength(1);
    expect(snaps[0].totalGasCardCost).toBe(150);
    expect((snaps[0].metadata as any).settledEntries).toHaveLength(2);
    expect((snaps[0].metadata as any).settledEntries[0].id).toBe('e1');
  });
});
