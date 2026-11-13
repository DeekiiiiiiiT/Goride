import { describe, expect, it } from 'vitest';
import { chargeWhen, formatTimeJm } from './tollV2Format';

describe('tollV2Format times', () => {
  it('formats clock times with uppercase AM/PM', () => {
    expect(formatTimeJm('2026-08-25T15:02:00-05:00')).toBe('3:02 PM');
    expect(formatTimeJm('2026-08-28T12:22:00-05:00')).toBe('12:22 PM');
    expect(formatTimeJm('2026-08-28T00:05:00-05:00')).toBe('12:05 AM');
  });

  it('formats chargeWhen with date and uppercase AM/PM', () => {
    expect(chargeWhen('2026-08-25T15:02:00-05:00')).toBe('25 Aug, 3:02 PM');
  });
});
