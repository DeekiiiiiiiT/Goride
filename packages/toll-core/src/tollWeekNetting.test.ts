import { describe, expect, it } from 'vitest';
import { computeTollWeekNetting, tollWeekIdentityCloses } from './tollWeekNetting.ts';

describe('computeTollWeekNetting — one netting, all four cards', () => {
  it('breaks out tag spend, cash-wash, platform coverage and dispute recovery', () => {
    const events = [
      // Real plaza/tag debit.
      { eventType: 'toll_charge', sourceType: 'transaction', sourceId: 'tag1', netAmount: -500 },
      // Trip charge that was cash-washed (has an inflow offset on same source).
      { eventType: 'toll_charge', sourceType: 'trip', sourceId: 'trip1', netAmount: -120 },
      { eventType: 'toll_charge_offset', direction: 'inflow', sourceId: 'trip1', netAmount: 120 },
      // Unmatched trip charge = Uber platform coverage (reimbursement).
      { eventType: 'toll_charge', sourceType: 'trip', sourceId: 'trip2', netAmount: -80 },
      // Operator refund.
      { eventType: 'toll_refund', netAmount: 50 },
    ];
    const r = computeTollWeekNetting(events);
    expect(r.tagSpend).toBeCloseTo(500, 2);
    expect(r.cashWashSpend).toBeCloseTo(120, 2);
    expect(r.platformReimbursed).toBeCloseTo(80, 2);
    // refund (50) + inflow offset (120), net of reinstated (0).
    expect(r.disputeRecovered).toBeCloseTo(170, 2);
    // 500 + 120 − 80 − 170 = 370.
    expect(r.netLoss).toBeCloseTo(370, 2);
  });

  it('produces a SIGNED negative net when the fleet over-recovers', () => {
    const r = computeTollWeekNetting([
      { eventType: 'toll_charge', sourceType: 'transaction', netAmount: -100 },
      { eventType: 'toll_refund', netAmount: 250 },
    ]);
    expect(r.netLoss).toBeCloseTo(-150, 2);
    expect(r.clipped).toBe(true);
  });

  it('residual is ~0 (identity closes) when there are no wallet recoveries', () => {
    const r = computeTollWeekNetting([
      { eventType: 'toll_charge', sourceType: 'transaction', netAmount: -500 },
      { eventType: 'toll_refund', netAmount: 200 },
    ]);
    expect(r.chargedToDrivers).toBe(0);
    expect(r.residual).toBeCloseTo(0, 2);
    expect(tollWeekIdentityCloses(r)).toBe(true);
  });

  it('residual surfaces the wallet-recovery gap that breaks the P&L identity', () => {
    const r = computeTollWeekNetting([
      { eventType: 'toll_charge', sourceType: 'transaction', netAmount: -500 },
      { eventType: 'toll_charged_to_driver', netAmount: -300 },
    ]);
    expect(r.chargedToDrivers).toBeCloseTo(300, 2);
    // Spend 500 − Reimbursed 0 − Charged 300 − NetLoss 500 = −300.
    expect(r.residual).toBeCloseTo(-300, 2);
    expect(tollWeekIdentityCloses(r)).toBe(false);
  });

  it('is empty-safe', () => {
    const r = computeTollWeekNetting(undefined);
    expect(r.netLoss).toBe(0);
    expect(r.residual).toBe(0);
    expect(r.clipped).toBe(false);
  });
});
