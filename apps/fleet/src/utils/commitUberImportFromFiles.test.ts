import { describe, expect, it } from 'vitest';
import {
  assertUberCashRefreshBundle,
  isYmdInWeek,
  tripYmd,
} from './uberCashRefreshScope';
import type { FileData } from './csvHelpers';

describe('Uber cash refresh week scope', () => {
  it('isYmdInWeek includes Mon–Sun of weekKey', () => {
    expect(isYmdInWeek('2026-02-16', '2026-02-16')).toBe(true);
    expect(isYmdInWeek('2026-02-22', '2026-02-16')).toBe(true);
    expect(isYmdInWeek('2026-02-23', '2026-02-16')).toBe(false);
    expect(isYmdInWeek('2026-02-15', '2026-02-16')).toBe(false);
  });

  it('tripYmd reads date or completed_at', () => {
    expect(tripYmd({ date: '2026-02-17' })).toBe('2026-02-17');
    expect(tripYmd({ completed_at: '2026-02-18T15:00:00Z' })).toBe('2026-02-18');
  });

  it('assertUberCashRefreshBundle requires driver + trip/tx', () => {
    const driver = { type: 'uber_payment_driver' } as FileData;
    const tx = { type: 'uber_payment' } as FileData;
    expect(() => assertUberCashRefreshBundle([driver])).toThrow(/both payments_driver/);
    expect(() => assertUberCashRefreshBundle([tx])).toThrow(/both payments_driver/);
    expect(() => assertUberCashRefreshBundle([driver, tx])).not.toThrow();
  });
});
