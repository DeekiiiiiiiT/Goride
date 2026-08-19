import { describe, expect, it } from 'vitest';
import { formatElapsed, formatMemberSince } from './formatElapsed';

describe('formatMemberSince', () => {
  it('formats created_at as month and year', () => {
    expect(formatMemberSince('2026-01-15T12:00:00.000Z')).toContain('2026');
    expect(formatMemberSince(null)).toBe('');
    expect(formatMemberSince('not-a-date')).toBe('');
  });
});

describe('formatElapsed', () => {
  it('formats session duration from go-online', () => {
    expect(formatElapsed(45_000)).toBe('0 min');
    expect(formatElapsed(5 * 60_000)).toBe('5 min');
    expect(formatElapsed(75 * 60_000)).toBe('1h 15m');
  });
});
