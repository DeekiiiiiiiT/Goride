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

  it('folds charged-to-drivers into net loss as a P&L recovery (identity closes)', () => {
    const r = computeTollWeekNetting([
      { eventType: 'toll_charge', sourceType: 'transaction', netAmount: -500 },
      { eventType: 'toll_charged_to_driver', netAmount: -300 },
    ]);
    expect(r.chargedToDrivers).toBeCloseTo(300, 2);
    // LOCKED: chargedToDrivers recovers P&L → NetLoss 500 − 300 = 200.
    expect(r.netLoss).toBeCloseTo(200, 2);
    // Spend 500 − Reimbursed 0 − Charged 300 − NetLoss 200 = 0.
    expect(r.residual).toBeCloseTo(0, 2);
    expect(tollWeekIdentityCloses(r)).toBe(true);
  });

  it('over-recovers (signed negative net) when drivers are charged more than fleet spend', () => {
    const r = computeTollWeekNetting([
      { eventType: 'toll_charge', sourceType: 'transaction', netAmount: -200 },
      { eventType: 'toll_charged_to_driver', netAmount: -300 },
    ]);
    expect(r.chargedToDrivers).toBeCloseTo(300, 2);
    // 200 − 300 = −100 → over-recovered, displayed loss floors to $0.
    expect(r.netLoss).toBeCloseTo(-100, 2);
    expect(r.clipped).toBe(true);
    expect(r.residual).toBeCloseTo(0, 2);
  });

  it('nets reversed wallet charges signed (charge − reversed) into recovery', () => {
    const r = computeTollWeekNetting([
      { eventType: 'toll_charge', sourceType: 'transaction', netAmount: -500 },
      { eventType: 'toll_charged_to_driver', netAmount: -300 },
      { eventType: 'toll_charge_reversed', netAmount: 100 },
    ]);
    // 300 charged − 100 reversed = 200 net recovery.
    expect(r.chargedToDrivers).toBeCloseTo(200, 2);
    // NetLoss 500 − 200 = 300; identity still closes.
    expect(r.netLoss).toBeCloseTo(300, 2);
    expect(r.residual).toBeCloseTo(0, 2);
    expect(tollWeekIdentityCloses(r)).toBe(true);
  });

  it('is empty-safe', () => {
    const r = computeTollWeekNetting(undefined);
    expect(r.netLoss).toBe(0);
    expect(r.residual).toBe(0);
    expect(r.clipped).toBe(false);
  });

  it('does not double-count platform_reimbursed offset + Uber toll_reimbursement', () => {
    // Matched tag: charge + P&L offset + Uber trip reimbursement (same $370 × 3).
    const events = [
      { eventType: 'toll_charge', sourceType: 'transaction', sourceId: 'tag1', netAmount: 370 },
      {
        eventType: 'toll_charge_offset',
        direction: 'inflow',
        sourceId: 'tag1',
        netAmount: 370,
        metadata: { reason: 'platform_reimbursed' },
      },
      {
        eventType: 'toll_reimbursement',
        sourceType: 'trip',
        sourceId: 'trip1',
        netAmount: 370,
      },
      { eventType: 'toll_charge', sourceType: 'transaction', sourceId: 'tag2', netAmount: 370 },
      {
        eventType: 'toll_charge_offset',
        direction: 'inflow',
        sourceId: 'tag2',
        netAmount: 370,
        metadata: { reason: 'platform_reimbursed' },
      },
      {
        eventType: 'toll_reimbursement',
        sourceType: 'trip',
        sourceId: 'trip2',
        netAmount: 370,
      },
      { eventType: 'toll_charge', sourceType: 'transaction', sourceId: 'tag3', netAmount: 370 },
      {
        eventType: 'toll_charge_offset',
        direction: 'inflow',
        sourceId: 'tag3',
        netAmount: 370,
        metadata: { reason: 'platform_reimbursed' },
      },
      {
        eventType: 'toll_reimbursement',
        sourceType: 'trip',
        sourceId: 'trip3',
        netAmount: 370,
      },
    ];
    const r = computeTollWeekNetting(events);
    expect(r.tagSpend).toBeCloseTo(1110, 2);
    expect(r.platformReimbursed).toBeCloseTo(1110, 2);
    expect(r.disputeRecovered).toBeCloseTo(0, 2);
    expect(r.netLoss).toBeCloseTo(0, 2);
    expect(tollWeekIdentityCloses(r)).toBe(true);
  });

  it('keeps platform_reimbursed offset when Uber reimbursement is absent', () => {
    const r = computeTollWeekNetting([
      { eventType: 'toll_charge', sourceType: 'transaction', sourceId: 'tag1', netAmount: 370 },
      {
        eventType: 'toll_charge_offset',
        direction: 'inflow',
        sourceId: 'tag1',
        netAmount: 370,
        metadata: { reason: 'platform_reimbursed' },
      },
    ]);
    expect(r.tagSpend).toBeCloseTo(370, 2);
    expect(r.platformReimbursed).toBeCloseTo(0, 2);
    expect(r.disputeRecovered).toBeCloseTo(370, 2);
    expect(r.netLoss).toBeCloseTo(0, 2);
  });
});
