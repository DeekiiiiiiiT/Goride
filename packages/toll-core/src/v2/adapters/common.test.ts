import { describe, expect, it } from 'vitest';
import { parseCsvDateTimeToJamaicaIso, toMinor } from './common.ts';

describe('toMinor', () => {
  it('parses comma decimals and currency noise', () => {
    expect(toMinor('1,917.18')).toBe(191718);
    expect(toMinor('$370')).toBe(37000);
    expect(toMinor('-10.5')).toBe(-1050);
    // Real tag statement / TransJam format (24–30 Aug 2026 files)
    expect(toMinor(' JMD -370.00')).toBe(-37000);
    expect(toMinor('JMD 5,000.00')).toBe(500000);
    expect(toMinor('J$1,200')).toBe(120000);
  });

  it('rejects junk decimals', () => {
    expect(toMinor('1.2.3')).toBeNull();
    expect(toMinor('1.005')).toBeNull();
    expect(toMinor('370.000')).toBe(37000);
  });
});

describe('parseCsvDateTimeToJamaicaIso', () => {
  it('prefers DD/MM for ambiguous numeric dates', () => {
    expect(parseCsvDateTimeToJamaicaIso('03/04/2024 10:30 am')).toBe('2024-04-03T10:30:00-05:00');
  });

  it('handles midnight and end of Sunday', () => {
    expect(parseCsvDateTimeToJamaicaIso('12/01/2024 12:00 am')).toBe('2024-01-12T00:00:00-05:00');
    expect(parseCsvDateTimeToJamaicaIso('11/11/2024 11:59 pm')).toBe('2024-11-11T23:59:00-05:00');
  });

  it('converts UTC and offset instants to Jamaica wall time', () => {
    expect(parseCsvDateTimeToJamaicaIso('2026-08-24T15:30:00Z')).toBe(
      '2026-08-24T10:30:00-05:00',
    );
    expect(parseCsvDateTimeToJamaicaIso('2026-08-24 15:30')).toBe(
      '2026-08-24T15:30:00-05:00',
    );
  });
});
