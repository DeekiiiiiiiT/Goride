import { describe, it, expect } from 'vitest';
import { computeWeeklyCashSettlement, CashWeekData } from './cashSettlementCalc';
import type { Trip, FinancialTransaction } from '../types/data';

/**
 * Covers the driver toll-charge DEBIT added to the weekly cash settlement:
 * a personal-use toll billed to the driver (the negative 'Toll Charge'
 * projection) must INCREASE what the driver owes, by exactly its magnitude,
 * and surface in breakdown.tollCharges — without disturbing anything else.
 *
 * Uses a delta approach (baseline vs baseline+charge) so it is robust to
 * whatever cash the fixture trip contributes.
 */

const WEEK_DAY = '2026-03-10T10:00:00Z'; // a Tuesday

const trip = (): Trip => ({
  id: 't1',
  date: WEEK_DAY,
  platform: 'Uber',
  status: 'Completed',
  driverId: 'D1',
} as unknown as Trip);

const tollCharge = (amount: number, over: Partial<FinancialTransaction> = {}): FinancialTransaction => ({
  id: 'tc1',
  driverId: 'D1',
  date: WEEK_DAY,
  description: 'Toll Charge (Personal Use)',
  category: 'Toll Charge',
  type: 'Adjustment',
  amount: -Math.abs(amount), // negative = debit
  status: 'Completed',
  paymentMethod: 'Cash',
  ...over,
} as unknown as FinancialTransaction);

/** Find the settlement week that contains the fixture day. */
function weekOf(rows: CashWeekData[]): CashWeekData {
  const day = new Date(WEEK_DAY).getTime();
  const w = rows.find(r => day >= r.start.getTime() && day <= r.end.getTime());
  if (!w) throw new Error('expected a week covering the fixture day');
  return w;
}

describe('computeWeeklyCashSettlement — driver toll charge', () => {
  it('adds the toll charge to amountOwed and balance (delta = charge)', () => {
    const base = weekOf(computeWeeklyCashSettlement({ trips: [trip()], transactions: [], csvMetrics: [] }));
    const withCharge = weekOf(
      computeWeeklyCashSettlement({ trips: [trip()], transactions: [tollCharge(12.34)], csvMetrics: [] }),
    );

    expect(+(withCharge.amountOwed - base.amountOwed).toFixed(2)).toBe(12.34);
    expect(+(withCharge.balance - base.balance).toFixed(2)).toBe(12.34);
    expect(withCharge.breakdown.tollCharges).toBe(12.34);
    expect(base.breakdown.tollCharges).toBe(0);
  });

  it('detects the projection via metadata even if category differs', () => {
    const viaMeta = tollCharge(5, { category: 'Adjustment', metadata: { projection: 'driver_toll_charge' } as any });
    const base = weekOf(computeWeeklyCashSettlement({ trips: [trip()], transactions: [], csvMetrics: [] }));
    const withCharge = weekOf(
      computeWeeklyCashSettlement({ trips: [trip()], transactions: [viaMeta], csvMetrics: [] }),
    );
    expect(+(withCharge.amountOwed - base.amountOwed).toFixed(2)).toBe(5);
    expect(withCharge.breakdown.tollCharges).toBe(5);
  });

  it('does not treat the toll charge as a cash payment credit', () => {
    // A debit must never reduce what the driver owes (i.e. never counted as amountPaid).
    const withCharge = weekOf(
      computeWeeklyCashSettlement({ trips: [trip()], transactions: [tollCharge(20)], csvMetrics: [] }),
    );
    // amountPaid should not include the charge; balance must be >= the charge.
    expect(withCharge.balance).toBeGreaterThanOrEqual(20 - 0.001);
  });

  it('non-breakage: no toll-charge txns ⇒ tollCharges is 0', () => {
    const w = weekOf(computeWeeklyCashSettlement({ trips: [trip()], transactions: [], csvMetrics: [] }));
    expect(w.breakdown.tollCharges).toBe(0);
  });

  it('nets charge + reversal to zero debt', () => {
    const charge = tollCharge(50, { id: 'c1', metadata: { projection: 'driver_toll_charge' } as any });
    const reversal = tollCharge(50, {
      id: 'r1',
      amount: 50,
      metadata: { projection: 'driver_toll_charge_reversal' } as any,
    });
    const base = weekOf(computeWeeklyCashSettlement({ trips: [trip()], transactions: [], csvMetrics: [] }));
    const withPair = weekOf(
      computeWeeklyCashSettlement({ trips: [trip()], transactions: [charge, reversal], csvMetrics: [] }),
    );
    expect(+(withPair.amountOwed - base.amountOwed).toFixed(2)).toBe(0);
    expect(withPair.breakdown.tollCharges).toBe(0);
  });
});
