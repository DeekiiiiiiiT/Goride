import { describe, expect, it } from 'vitest';
import { dayDots, formatAgo, formatWeekRange, formatWeekTitle, sourceChip, stepNumberFor } from './weekListFormat';

describe('week dates in words', () => {
  it('titles and ranges', () => {
    expect(formatWeekTitle('2026-11-02')).toBe('Week of 2 Nov 2026');
    expect(formatWeekRange('2026-11-02')).toBe('2–8 Nov 2026');
    expect(formatWeekRange('2026-09-28')).toBe('28 Sep – 4 Oct 2026');
    expect(formatWeekRange('2025-12-29')).toBe('29 Dec 2025 – 4 Jan 2026');
  });
  it('ago', () => {
    const now = Date.parse('2026-11-11T12:00:00Z');
    expect(formatAgo(null, now)).toBeNull();
    expect(formatAgo('2026-11-11T11:59:50Z', now)).toBe('just now');
    expect(formatAgo('2026-11-11T11:55:00Z', now)).toBe('5 min ago');
    expect(formatAgo('2026-11-11T09:00:00Z', now)).toBe('3 h ago');
    expect(formatAgo('2026-11-06T12:00:00Z', now)).toBe('5 days ago');
  });
});

describe('source chips', () => {
  it('needed vs optional vs hidden', () => {
    expect(sourceChip({ id: 'x', status: 'missing', requirement: 'required' })?.tone).toBe('needed');
    expect(sourceChip({ id: 'x', status: 'missing', requirement: 'optional' })?.tone).toBe('optional');
    expect(sourceChip({ id: 'x', status: 'received' })?.tone).toBe('done');
    expect(sourceChip({ id: 'x', status: 'not_applicable' })).toBeNull();
  });
});

describe('step number and day dots', () => {
  it('missing file is step 1, close is step 8', () => {
    expect(stepNumberFor({ kind: 'source', targetId: 'uber' })).toBe(1);
    expect(stepNumberFor({ kind: 'close', targetId: 'close' })).toBe(8);
    expect(stepNumberFor({ kind: 'step', targetId: 'fuel' })).toBe(5);
  });
  it('a day has data when any source covers it', () => {
    const dots = dayDots('2026-11-02', [{ coverage: { '2026-11-02': 'covered' } }, { coverage: { '2026-11-03': 'zero_attested' } }]);
    expect(dots.map((d) => d.hasData)).toEqual([true, true, false, false, false, false, false]);
  });
});
