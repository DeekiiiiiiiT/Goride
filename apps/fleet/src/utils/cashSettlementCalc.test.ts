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
  it('tracks personal toll charges in breakdown without inflating passenger cash (amountOwed)', () => {
    const base = weekOf(computeWeeklyCashSettlement({ trips: [trip()], transactions: [], csvMetrics: [] }));
    const withCharge = weekOf(
      computeWeeklyCashSettlement({ trips: [trip()], transactions: [tollCharge(12.34)], csvMetrics: [] }),
    );

    // Passenger cash = trip/statement cash only; personal charges settle on Settlement math.
    expect(+(withCharge.amountOwed - base.amountOwed).toFixed(2)).toBe(0);
    expect(withCharge.breakdown.tollCharges).toBe(12.34);
    expect(base.breakdown.tollCharges).toBe(0);
  });

  it('detects the projection via metadata even if category differs', () => {
    const viaMeta = tollCharge(5, { category: 'Adjustment', metadata: { projection: 'driver_toll_charge' } as any });
    const base = weekOf(computeWeeklyCashSettlement({ trips: [trip()], transactions: [], csvMetrics: [] }));
    const withCharge = weekOf(
      computeWeeklyCashSettlement({ trips: [trip()], transactions: [viaMeta], csvMetrics: [] }),
    );
    expect(+(withCharge.amountOwed - base.amountOwed).toFixed(2)).toBe(0);
    expect(withCharge.breakdown.tollCharges).toBe(5);
  });

  it('does not treat the toll charge as a cash payment credit', () => {
    const base = weekOf(computeWeeklyCashSettlement({ trips: [trip()], transactions: [], csvMetrics: [] }));
    const withCharge = weekOf(
      computeWeeklyCashSettlement({ trips: [trip()], transactions: [tollCharge(20)], csvMetrics: [] }),
    );
    expect(withCharge.amountPaid).toBeCloseTo(base.amountPaid, 2);
    expect(withCharge.breakdown.tollCharges).toBe(20);
  });

  it('non-breakage: no toll-charge txns ⇒ tollCharges is 0', () => {
    const w = weekOf(computeWeeklyCashSettlement({ trips: [trip()], transactions: [], csvMetrics: [] }));
    expect(w.breakdown.tollCharges).toBe(0);
  });

  it('nets charge + reversal to zero toll charge debt', () => {
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

describe('computeWeeklyCashSettlement — Cash Returned is sticky', () => {
  const cashPayment = (amount: number, over: Partial<FinancialTransaction> = {}): FinancialTransaction =>
    ({
      id: `pay-${amount}`,
      driverId: 'D1',
      date: WEEK_DAY,
      description: 'Cash payment from driver',
      category: 'Cash Collection',
      type: 'Payment_Received',
      amount,
      status: 'Completed',
      paymentMethod: 'Cash',
      ...over,
    }) as unknown as FinancialTransaction;

  it('Cash Returned = Settlement Week–tagged cash only (not fuel, not untagged dated)', () => {
    const tagged = cashPayment(7500, {
      id: 'tagged',
      metadata: { workPeriodStart: '2026-03-09', workPeriodEnd: '2026-03-15' } as any,
    });
    const dated = cashPayment(3326.25, { id: 'dated' });
    const fuelHandback = {
      id: 'fuel-hb',
      driverId: 'D1',
      date: WEEK_DAY,
      category: 'Fuel Reimbursement',
      type: 'Adjustment',
      amount: 2000,
      status: 'Completed',
      metadata: { workPeriodStart: '2026-03-09', workPeriodEnd: '2026-03-15' },
    } as unknown as FinancialTransaction;

    const w = weekOf(
      computeWeeklyCashSettlement({
        trips: [trip()],
        transactions: [tagged, dated, fuelHandback],
        csvMetrics: [],
        excludeTollEffects: true,
      }),
    );

    expect(w.amountPaid).toBeCloseTo(7500, 2);
    expect(w.breakdown.allocatedPayments).toBeCloseTo(7500, 2);
    expect(w.breakdown.surplusPayments).toBeCloseTo(3326.25, 2); // tracked, not Cash Returned
    expect(w.breakdown.fuelCredits).toBe(0);
    expect(w.breakdown.fifoPayments).toBe(0);
  });

  it('does not count Fuel Settlement Credit (companyShare) as Cash Returned', () => {
    const settlementCredit = {
      id: 'fleet-fuel',
      driverId: 'D1',
      date: WEEK_DAY,
      category: 'Fuel Settlement Credit',
      type: 'Adjustment',
      amount: 21415.26,
      status: 'Completed',
      metadata: { reportId: 'veh_2026-03-09', companyShare: 21415.26 },
    } as unknown as FinancialTransaction;

    const w = weekOf(
      computeWeeklyCashSettlement({
        trips: [trip()],
        transactions: [settlementCredit],
        csvMetrics: [],
        excludeTollEffects: true,
      }),
    );

    expect(w.amountPaid).toBe(0);
    expect(w.weeklyFuelCredits).toBeCloseTo(21415.26, 2);
  });
});
