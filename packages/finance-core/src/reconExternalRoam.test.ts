import { describe, expect, it } from 'vitest';
import { roamFuelExternalCopy, roamFuelStatementDeadlineYmd } from './reconExternalRoam.ts';

describe('reconExternalRoam', () => {
  it('deadline is Wednesday after week end', () => {
    expect(roamFuelStatementDeadlineYmd('2026-10-05')).toBe('2026-10-14');
  });

  it('marks overdue after deadline Wednesday', () => {
    const copy = roamFuelExternalCopy('2026-10-05', new Date('2026-10-15T12:00:00Z'));
    expect(copy.isOverdue).toBe(true);
    expect(copy.statusLine).toMatch(/overdue/i);
  });

  it('shows expected by before deadline', () => {
    const copy = roamFuelExternalCopy('2026-10-05', new Date('2026-10-13T12:00:00Z'));
    expect(copy.isOverdue).toBe(false);
    expect(copy.statusLine).toMatch(/expected by Wednesday/i);
  });
});
