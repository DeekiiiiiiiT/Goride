import { describe, expect, it } from 'vitest';
import { pickLatestRestatementDrafts } from './latestRestatementDrafts';

describe('pickLatestRestatementDrafts', () => {
  it('keeps only the highest version per driver/week/kind', () => {
    const rows = [
      { driverId: 'd1', weekKey: '2026-08-31', kind: 'earnings', version: 5, status: 'draft' },
      { driverId: 'd1', weekKey: '2026-08-31', kind: 'earnings', version: 9, status: 'draft' },
      { driverId: 'd1', weekKey: '2026-08-31', kind: 'earnings', version: 8, status: 'draft' },
      { driverId: 'd1', weekKey: '2026-08-24', kind: 'earnings', version: 6, status: 'draft' },
      { driverId: 'd1', weekKey: '2026-08-31', kind: 'fuel', version: 2, status: 'draft' },
    ];
    const out = pickLatestRestatementDrafts(rows);
    expect(out).toHaveLength(3);
    expect(out.find((r) => r.weekKey === '2026-08-31' && r.kind === 'earnings')?.version).toBe(9);
    expect(out.find((r) => r.weekKey === '2026-08-24')?.version).toBe(6);
    expect(out.find((r) => r.kind === 'fuel')?.version).toBe(2);
  });

  it('ignores non-draft rows', () => {
    const out = pickLatestRestatementDrafts([
      { driverId: 'd1', weekKey: '2026-08-31', kind: 'earnings', version: 9, status: 'closed' },
      { driverId: 'd1', weekKey: '2026-08-31', kind: 'earnings', version: 8, status: 'draft' },
    ]);
    expect(out).toEqual([
      { driverId: 'd1', weekKey: '2026-08-31', kind: 'earnings', version: 8, status: 'draft' },
    ]);
  });
});
