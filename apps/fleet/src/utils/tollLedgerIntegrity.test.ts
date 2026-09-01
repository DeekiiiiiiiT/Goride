import { describe, expect, it } from 'vitest';
import {
  buildTollContentFingerprint,
  findDuplicateTollLedgerEntry,
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

  it('treats metadata.laneId as alias for lane in fingerprints', () => {
    const withLane = buildTollContentFingerprint({
      vehicleId: 'v1',
      date: '2026-08-17',
      amount: -850,
      lane: 'W03',
      collector: '12',
    });
    const withLaneId = buildTollContentFingerprint({
      vehicleId: 'v1',
      date: '2026-08-17',
      amount: 850,
      metadata: { laneId: 'W03', collector: '12' },
    });
    expect(withLane).toBe(withLaneId);
  });

  it('includes referenceNumber in fingerprint so vendor spelling drift does not split identity', () => {
    const a = buildTollContentFingerprint({
      vehicleId: 'v1',
      date: '2026-08-17',
      amount: -850,
      plaza: 'Transjam Highways',
      referenceNumber: '00700049',
    });
    const b = buildTollContentFingerprint({
      vehicleId: 'v1',
      date: '2026-08-17',
      amount: 850,
      plaza: 'TransJamaican Highways',
      referenceNumber: '00700049',
    });
    expect(a).toBe(b);
  });

  it('findDuplicateTollLedgerEntry matches by reference number first', () => {
    const existing = [
      {
        id: 'keep-me',
        date: '2026-08-17',
        amount: -850,
        referenceNumber: '00700049',
        driverId: 'd1',
        vehicleId: 'v1',
        status: 'pending',
      },
    ];
    const candidate = {
      id: 'new-import',
      date: '2026-08-17',
      amount: -850,
      referenceNumber: '00700049',
      driverId: 'd1',
      vehicleId: 'v1',
    };
    const dup = findDuplicateTollLedgerEntry(candidate, existing);
    expect(dup?.existingId).toBe('keep-me');
    expect(dup?.reason).toBe('reference_number');
  });

  it('findDuplicateTollLedgerEntry skips voided rows', () => {
    const existing = [
      {
        id: 'voided-row',
        date: '2026-08-17',
        amount: -850,
        referenceNumber: '00700049',
        status: 'voided',
      },
    ];
    const candidate = {
      id: 'new-import',
      date: '2026-08-17',
      amount: -850,
      referenceNumber: '00700049',
    };
    expect(findDuplicateTollLedgerEntry(candidate, existing)).toBeNull();
  });

  it('excludes voided rows from spend / period counts', () => {
    expect(
      isTollIncludedInSpend({
        paymentMethod: 'cash',
        status: 'voided',
        amount: 0,
        metadata: { voided: true, originalAmount: -850 },
        plaza: 'Vineyards West',
        batchId: 'batch-1',
      }),
    ).toBe(false);
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

  it('does not quarantine real plaza when only merchantHighway is Transjam', () => {
    const row = {
      paymentMethod: 'cash',
      batchId: null,
      plaza: 'Portmore West',
      vendor: 'Portmore West',
      tripId: null,
      metadata: {
        plaza: 'Portmore West',
        merchantHighway: 'Transjam Highways',
        highway: 'TransJamaica Highways',
      },
    };
    expect(matchesSyntheticCashTollSignature(row)).toBe(false);
    expect(isTollIncludedInSpend(row)).toBe(true);
  });

  it('does not quarantine Aug-24-style cleaned cash with real plaza + receipt metadata', () => {
    const row = {
      paymentMethod: 'Cash',
      batchId: null,
      plaza: 'Vineyards East',
      vendor: 'Vineyards East',
      receiptUrl: 'https://example.com/receipt.jpg',
      metadata: {
        plaza: 'Vineyards East',
        ledgerPlaza: 'Vineyards East',
        merchantHighway: 'Transjam Highways',
      },
    };
    expect(matchesSyntheticCashTollSignature(row)).toBe(false);
    expect(isTollIncludedInSpend(row)).toBe(true);
  });

  it('still quarantines highway-as-display plaza with OCR Vineyards (Audit 1.1)', () => {
    const row = {
      paymentMethod: 'cash',
      batchId: null,
      plaza: 'Transjam Highways',
      vendor: 'Transjam Highways',
      metadata: {
        plaza: 'Vineyards West',
        ledgerPlaza: 'Transjam Highways',
      },
    };
    expect(matchesSyntheticCashTollSignature(row)).toBe(true);
    expect(isTollIncludedInSpend(row)).toBe(false);
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
