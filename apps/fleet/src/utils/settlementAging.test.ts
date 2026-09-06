import { describe, expect, it } from 'vitest';
import { agingBucket, daysOverdue } from './settlementAging';

describe('settlementAging', () => {
  const asOf = new Date('2026-09-05T15:00:00');

  it('daysOverdue counts whole days since periodEnd', () => {
    expect(daysOverdue('2026-09-05', asOf)).toBe(0);
    expect(daysOverdue('2026-09-04', asOf)).toBe(1);
    expect(daysOverdue('2026-08-06', asOf)).toBe(30);
    expect(daysOverdue('2026-08-05', asOf)).toBe(31);
    expect(daysOverdue('2026-06-07', asOf)).toBe(90);
    expect(daysOverdue('2026-06-06', asOf)).toBe(91);
  });

  it('daysOverdue clamps future periodEnds to 0', () => {
    expect(daysOverdue('2026-09-10', asOf)).toBe(0);
  });

  it('agingBucket maps day ranges', () => {
    expect(agingBucket('2026-09-05', asOf)).toBe('0-30');
    expect(agingBucket('2026-08-06', asOf)).toBe('0-30'); // 30d
    expect(agingBucket('2026-08-05', asOf)).toBe('31-60'); // 31d
    expect(agingBucket('2026-07-07', asOf)).toBe('31-60'); // 60d
    expect(agingBucket('2026-07-06', asOf)).toBe('61-90'); // 61d
    expect(agingBucket('2026-06-07', asOf)).toBe('61-90'); // 90d
    expect(agingBucket('2026-06-06', asOf)).toBe('90+'); // 91d
  });

  it('handles invalid periodEnd as 0 / 0-30', () => {
    expect(daysOverdue('', asOf)).toBe(0);
    expect(agingBucket('not-a-date', asOf)).toBe('0-30');
  });
});
