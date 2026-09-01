import { describe, expect, it } from 'vitest';
import { isTollIncludedInSpend } from './tollLedgerIntegrity';
import {
  collectConfirmedLinkedTripIds,
  isTripCashWashSpend,
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
