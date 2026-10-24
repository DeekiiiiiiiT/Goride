import { describe, expect, it } from 'vitest';
import { partitionByLockedDate } from './fixedExpenseOccurrences.ts';

describe('partitionByLockedDate', () => {
  it('skips a locked due date and keeps the open one', () => {
    const split = partitionByLockedDate(
      [{ date: '2026-10-15' }, { date: '2026-10-22' }],
      (ymd) => ymd === '2026-10-15',
    );
    expect(split.skippedLocked).toBe(1);
    expect(split.open).toEqual([{ date: '2026-10-22' }]);
  });
});
