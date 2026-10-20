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

  // R4-05: close must hash live volume — null/zero (missing select) ≠ real late-row volume
  it('null volume (stored-missing) differs from live late-row volume', () => {
    const atComplete = coverageInputHash(covered, { rowCount: 10, amountMinor: 2500 });
    const missingSelect = coverageInputHash(covered, { rowCount: null, amountMinor: null });
    const afterLateRows = coverageInputHash(covered, { rowCount: 12, amountMinor: 2800 });
    expect(missingSelect).not.toBe(atComplete);
    expect(afterLateRows).not.toBe(atComplete);
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
