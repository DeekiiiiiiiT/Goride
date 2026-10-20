import { describe, expect, it } from 'vitest';
import {
  coverageInputHash,
  countTripsEarningsBlockers,
  isReconHumanSourceStatus,
} from './coverageInputHash.ts';

describe('coverageInputHash (R3-06)', () => {
  const covered = {
    '2026-10-13': 'covered',
    '2026-10-14': 'covered',
  };

  it('same days different row_count → different hash', () => {
    expect(coverageInputHash(covered, { rowCount: 10, amountMinor: 100 })).not.toBe(
      coverageInputHash(covered, { rowCount: 30, amountMinor: 100 }),
    );
  });

  it('same days different amount → different hash', () => {
    expect(coverageInputHash(covered, { rowCount: 10, amountMinor: 100 })).not.toBe(
      coverageInputHash(covered, { rowCount: 10, amountMinor: 500 }),
    );
  });

  it('identical coverage + volume → same hash', () => {
    expect(coverageInputHash(covered, { rowCount: 5, amountMinor: 99 })).toBe(
      coverageInputHash(covered, { rowCount: 5, amountMinor: 99 }),
    );
  });
});

describe('isReconHumanSourceStatus (R3-05)', () => {
  it('keeps waived and attested_none', () => {
    expect(isReconHumanSourceStatus('waived')).toBe(true);
    expect(isReconHumanSourceStatus('attested_none')).toBe(true);
    expect(isReconHumanSourceStatus('received')).toBe(false);
  });
});

describe('countTripsEarningsBlockers (R3-08)', () => {
  it('counts cash/earnings codes only', () => {
    expect(
      countTripsEarningsBlockers([
        { code: 'CASH_SOURCE_MISMATCH' },
        { code: 'FUEL_DRIVER_SHARE_MISMATCH' },
        { code: 'EARNINGS_GROSS_IDENTITY' },
      ]),
    ).toBe(2);
  });
});
