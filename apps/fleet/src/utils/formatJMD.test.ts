import { describe, expect, it } from 'vitest';
import { formatJMD, formatJMDDelta } from './formatJMD';
import { formatFuelMoney } from './formatFuelMoney';
import { formatLockedAt } from '../components/fuel/reconciliation/FuelWeekLockedReceipt';

describe('money and dates read as Jamaican (15 Nov 2026)', () => {
  it('JMD always shows "J$", never a bare "$"', () => {
    expect(formatFuelMoney(28000)).toBe('J$28,000.00');
    expect(formatJMD(92021.2)).toBe('J$92,021');
    expect(formatJMD(-5500, 2)).toBe('-J$5,500.00');
    expect(formatJMD(-0.001, 2)).toBe('J$0.00');
    expect(formatJMD(Number.NaN)).toBe('J$0');
    expect(formatJMDDelta(-1755)).toBe('-J$1,755');
  });

  it('a locked fuel week reads "15 Nov 2026, 9:41 AM" on the Jamaica clock', () => {
    expect(formatLockedAt('2026-11-15T14:41:29.944Z')).toBe('15 Nov 2026, 9:41 AM');
    expect(formatLockedAt('not a date')).toBe('on the server');
  });
});
