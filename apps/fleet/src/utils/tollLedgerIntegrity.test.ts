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

  it('quarantines API tx shape where OCR plaza overwrote metadata.plaza', () => {
    const apiRow = {
      paymentMethod: 'Cash',
      vendor: 'TransJam Highways',
      plaza: 'TransJam Highways',
      batchId: null,
      tripId: null,
      metadata: {
        plaza: 'Vineyards East',
        ledgerPlaza: 'TransJam Highways',
        batchId: null,
      },
    };
    expect(matchesSyntheticCashTollSignature(apiRow)).toBe(true);
    expect(isTollIncludedInSpend(apiRow)).toBe(false);
  });

  it('quarantines API row using vendor alone when plaza field missing', () => {
    const apiRow = {
      paymentMethod: 'Cash',
      vendor: 'TRANSJAMAICA HIGHWAYS',
      metadata: { plaza: 'Vineyards West' },
    };
    expect(matchesSyntheticCashTollSignature(apiRow)).toBe(true);
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

  it('does not quarantine tag import when batchId only on metadata', () => {
    const row = {
      paymentMethod: 'Tag Balance',
      vendor: 'Vineyards East',
      metadata: { batchId: 'be49c887', plaza: 'Vineyards East' },
    };
    expect(isTollQuarantined(row)).toBe(false);
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
