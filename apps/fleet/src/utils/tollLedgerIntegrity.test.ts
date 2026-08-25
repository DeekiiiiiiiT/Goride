import { describe, expect, it } from 'vitest';
import {
  buildTollContentFingerprint,
  isSuspiciousVineyardsCashRate,
  isTollIncludedInSpend,
  isTollQuarantined,
  matchesSyntheticCashTollSignature,
  resolveTollPlazaSSot,
  VINEYARDS_EAST_CASH_OCR_RATE_JMD,
} from './tollLedgerIntegrity';

describe('tollLedgerIntegrity', () => {
  it('builds stable content fingerprints across UUID differences', () => {
    const a = buildTollContentFingerprint({
      vehicleId: 'v1',
      date: '2026-05-15T14:00:00Z',
      amount: -850,
      lane: 'W03',
      collector: '12',
    });
    const b = buildTollContentFingerprint({
      vehicleId: 'v1',
      date: '2026-05-15',
      amount: 850,
      metadata: { lane: 'W03', collector: '12' },
    });
    expect(a).toBe(b);
  });

  it('prefers OCR plaza over highway merchant for SSOT', () => {
    const r = resolveTollPlazaSSot({
      vendor: 'Transjam Highways',
      metadata: { plaza: 'Vineyards East' },
    });
    expect(r.plaza).toBe('Vineyards East');
    expect(r.metadata.merchantHighway).toBe('Transjam Highways');
  });

  it('quarantines synthetic cash Transjam rows without batch', () => {
    const row = {
      paymentMethod: 'cash',
      batchId: null,
      plaza: 'TransJam Highways',
      metadata: { plaza: 'Vineyards West' },
      tripId: 'manual_abc',
    };
    expect(matchesSyntheticCashTollSignature(row)).toBe(true);
    expect(isTollQuarantined(row)).toBe(true);
    expect(isTollIncludedInSpend(row)).toBe(false);
  });

  it('does not quarantine tag-batch imports', () => {
    const row = {
      paymentMethod: 'tag_balance',
      batchId: 'be49c887',
      plaza: 'Vineyards East',
      amount: -780,
      metadata: {},
    };
    expect(isTollQuarantined(row)).toBe(false);
    expect(isTollIncludedInSpend(row)).toBe(true);
  });

  it('flags Vineyards cash OCR $850 vs tag $780', () => {
    expect(
      isSuspiciousVineyardsCashRate({
        paymentMethod: 'cash',
        plaza: 'Vineyards East',
        amount: -VINEYARDS_EAST_CASH_OCR_RATE_JMD,
        metadata: {},
      }),
    ).toBe(true);
  });
});
