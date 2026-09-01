import { describe, expect, it } from 'vitest';
import { isTollIncludedInSpend } from './tollLedgerIntegrity';
import {
  collectConfirmedLinkedTripIds,
  isTripCashWashSpend,
  isTripTollActionable,
  resolvePeriodTollCashWash,
  sumExcludedCashFromWeek,
} from './periodTollCashSpend';

describe('periodTollCashSpend', () => {
  it('links tripId and preUnlinkedTripId', () => {
    const ids = collectConfirmedLinkedTripIds([
      { tripId: 't1' },
      { preUnlinkedTripId: 't2' },
      { metadata: { tripId: 't3', preUnlinkedTripId: 't4' } },
    ]);
    expect([...ids].sort()).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('adds only cash_wash trips, not pending unlinked', () => {
    const linked = new Set<string>();
    expect(
      isTripCashWashSpend(
        { id: 'a', tollCharges: 400, tollRefundResolution: { status: 'cash_wash' } },
        linked,
      ),
    ).toBe(true);
    expect(
      isTripCashWashSpend(
        { id: 'b', tollCharges: 400, tollRefundResolution: { status: 'pending' } },
        linked,
      ),
    ).toBe(false);
    expect(
      isTripCashWashSpend({ id: 'c', tollCharges: 400, tollRefundResolution: null }, linked),
    ).toBe(false);
    expect(
      isTripCashWashSpend(
        { id: 'a', tollCharges: 400, tollRefundResolution: { status: 'cash_wash' } },
        new Set(['a']),
      ),
    ).toBe(false);
  });

  it('NEW-3: pending/null unlinked trip tolls are actionable without wash', () => {
    const linked = new Set<string>();
    expect(
      isTripTollActionable(
        { id: 'p', tollCharges: 400, tollRefundResolution: { status: 'pending' } },
        linked,
      ),
    ).toBe(true);
    expect(
      isTripTollActionable({ id: 'n', tollCharges: 400, tollRefundResolution: null }, linked),
    ).toBe(true);
    expect(isTripTollActionable({ id: 'u', tollCharges: 400 }, linked)).toBe(true);
    expect(
      isTripTollActionable(
        { id: 'w', tollCharges: 400, tollRefundResolution: { status: 'cash_wash' } },
        linked,
      ),
    ).toBe(false);
    expect(
      isTripTollActionable(
        { id: 'x', tollCharges: 400, tollRefundResolution: { status: 'phantom' } },
        linked,
      ),
    ).toBe(false);
    expect(
      isTripTollActionable(
        { id: 'p', tollCharges: 400, tollRefundResolution: { status: 'pending' } },
        new Set(['p']),
      ),
    ).toBe(false);
  });

  it('NEW-4: wash resolver prefers metadata wash over classified cash spend', () => {
    expect(
      resolvePeriodTollCashWash({
        tollCashSpend: 900,
        metadata: { financeCore: { tollCashWashEligible: 400 } },
      }),
    ).toBe(400);
    expect(resolvePeriodTollCashWash({ tollCashSpend: 900, metadata: {} })).toBe(900);
  });

  it('P-1 guard: when toll_cash_spend exceeds wash eligible, credit uses smaller value', () => {
    const wash = resolvePeriodTollCashWash({
      tollCashSpend: 3000,
      metadata: { financeCore: { tollCashWashEligible: 1000 } },
    });
    expect(wash).toBe(1000);
    expect(wash).toBeLessThan(3000);
  });

  it('sums excluded highway-as-plaza cash and keeps clean cash', () => {
    const week = [
      {
        paymentMethod: 'cash',
        amount: -850,
        plaza: 'Transjam Highways',
        metadata: { plaza: 'Vineyards West', ledgerPlaza: 'Transjam Highways' },
      },
      {
        paymentMethod: 'cash',
        amount: -400,
        plaza: 'Portmore West',
        metadata: { plaza: 'Portmore West', merchantHighway: 'Transjam Highways' },
      },
      {
        paymentMethod: 'tag_balance',
        amount: -370,
        plaza: 'Portmore East',
      },
    ];
    const { excludedCashSpend, excludedCashCount } = sumExcludedCashFromWeek(week, (t) =>
      isTollIncludedInSpend(t as any),
    );
    expect(excludedCashCount).toBe(1);
    expect(excludedCashSpend).toBe(850);
  });
});

/** Spend classification invariant (NEW-4): tollSpend ≈ cash + tag by payment method. */
describe('toll spend classification invariant', () => {
  it('cash + tag equals total spend for mixed ledger rows', () => {
    const rows = [
      { paymentMethod: 'cash', amount: -400 },
      { paymentMethod: 'tag', amount: -250 },
      { paymentMethod: 'Cash Plaza', amount: -100 },
      { paymentMethod: 'tag_balance', amount: -50 },
    ];
    let tollSpend = 0;
    let tollCashSpend = 0;
    let tollTagSpend = 0;
    for (const tx of rows) {
      const amt = Math.abs(tx.amount);
      tollSpend += amt;
      const cash = String(tx.paymentMethod || '').toLowerCase().includes('cash');
      if (cash) tollCashSpend += amt;
      else tollTagSpend += amt;
    }
    expect(tollCashSpend + tollTagSpend).toBeCloseTo(tollSpend, 2);
    expect(tollCashSpend).toBe(500);
    expect(tollTagSpend).toBe(300);
  });
});
