import { describe, expect, it } from 'vitest';
import { buildPlatformBreakdownData } from './useDriverPlatformBreakdown';
import type { Trip } from '../../../types/data';

describe('buildPlatformBreakdownData', () => {
  it('uses period platformStats when present (ledger SSOT)', () => {
    const rows = buildPlatformBreakdownData([], {
      Uber: { earnings: 50000 },
      InDrive: { earnings: 26909.3 },
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Uber', value: 50000 }),
        expect.objectContaining({ name: 'InDrive', value: 26909.3 }),
      ]),
    );
    expect(rows.reduce((s, r) => s + r.value, 0)).toBeCloseTo(76909.3);
  });

  it('falls back to completed trip earnings when period stats empty', () => {
    const trips = [
      { id: '1', status: 'Completed', platform: 'Uber', amount: 100 },
      { id: '2', status: 'Cancelled', platform: 'Uber', amount: 50 },
    ] as unknown as Trip[];

    const rows = buildPlatformBreakdownData(trips, {});
    expect(rows).toEqual([expect.objectContaining({ name: 'Uber', value: 100 })]);
  });

  it('skips Dispute Recoveries and zero earnings', () => {
    const rows = buildPlatformBreakdownData([], {
      Uber: { earnings: 10 },
      'Dispute Recoveries': { earnings: 999 },
      Roam: { earnings: 0 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Uber');
  });
});
