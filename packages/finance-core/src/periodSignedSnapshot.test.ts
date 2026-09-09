import { describe, expect, it } from 'vitest';
import { preservePeriodMetaKeys, resolveSignedSnapshot } from './periodSignedSnapshot.ts';
import { computePeriodSettlement } from './driverPeriodSettlement.ts';

describe('periodSignedSnapshot', () => {
  it('stamps snapshot when settlement_paid increases', () => {
    const settled = computePeriodSettlement({
      driverShare: 5000,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 3000,
    });
    const snap = resolveSignedSnapshot({
      priorMeta: {},
      prevSettlementPaid: 1000,
      settled,
      cashStillHeld: 0,
      at: '2026-09-01T00:00:00.000Z',
    });
    expect(snap?.settlement_paid).toBe(3000);
    expect(snap?.at).toBe('2026-09-01T00:00:00.000Z');
  });

  it('preserves prior signedSnapshot when paid does not increase', () => {
    const prior = {
      signedSnapshot: {
        at: '2026-08-01',
        settlement_amount: -100,
        payout_net: 5000,
        settlement_paid: 5000,
        cash_still_held: 0,
      },
    };
    const settled = computePeriodSettlement({
      driverShare: 5000,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 5000,
    });
    const snap = resolveSignedSnapshot({
      priorMeta: prior,
      prevSettlementPaid: 5000,
      settled,
      cashStillHeld: 0,
    });
    expect(snap).toEqual(prior.signedSnapshot);
  });

  it('preservePeriodMetaKeys keeps signedSnapshot across rebuild', () => {
    const prior = {
      signedSnapshot: { at: 'x', settlement_paid: 1 },
      financeCore: { overpaidAmount: 5 },
    };
    const kept = preservePeriodMetaKeys(prior);
    expect(kept.signedSnapshot).toEqual(prior.signedSnapshot);
    expect(kept.financeCore).toBeUndefined();
  });

  // N-8: cash sync must not strip service-line trip counts H-8 SQL filters depend on.
  it('preservePeriodMetaKeys keeps rushTripCount and rideshareTripCount including zeros', () => {
    const prior = {
      signedSnapshot: { at: 'x', settlement_paid: 1 },
      rushTripCount: 0,
      rideshareTripCount: 12,
      financeCore: { noise: true },
    };
    const kept = preservePeriodMetaKeys(prior);
    expect(kept.rushTripCount).toBe(0);
    expect(kept.rideshareTripCount).toBe(12);
    expect(kept.signedSnapshot).toEqual(prior.signedSnapshot);
    expect(kept.financeCore).toBeUndefined();
  });
});
