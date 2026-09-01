import { describe, expect, it } from 'vitest';
import { buildCashSettlementPersistFields, buildPeriodMetadata } from './periodPersistBody.ts';
import { computePeriodSettlement } from './driverPeriodSettlement.ts';

describe('periodPersistBody', () => {
  it('buildCashSettlementPersistFields dual-writes minor columns', () => {
    const settled = computePeriodSettlement({
      driverShare: 10000,
      fuelDeduction: 500,
      baseCashOwed: 8000,
      baseCashPaid: 5000,
      tollCashWash: 0,
      tollPersonal: 0,
      tipsPaidToDriver: 580,
    });
    const fields = buildCashSettlementPersistFields({
      cashReturned: 5000,
      cashWrittenOff: 0,
      settled,
      derived: {
        settlementStatus: 'company_owes',
        payoutStatus: 'finalized',
        periodStatus: 'closed',
        cashStillHeld: 100,
        tollsClear: true,
        moneyUnlocked: true,
      },
      metadata: {},
    });
    expect(fields.settlement_amount_minor).toBe(Math.round(fields.settlement_amount * 100));
    expect(fields.payout_net_minor).toBe(Math.round(fields.payout_net * 100));
    expect(fields.cash_still_held_minor).toBe(Math.round(fields.cash_still_held * 100));
  });

  it('buildPeriodMetadata preserves signedSnapshot from prior rebuild', () => {
    const priorSnap = {
      at: '2026-08-15',
      settlement_amount: -7000,
      payout_net: 0,
      settlement_paid: 5000,
      cash_still_held: 0,
    };
    const settled = computePeriodSettlement({
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 2000,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 5000,
    });
    const meta = buildPeriodMetadata({
      priorMeta: { signedSnapshot: priorSnap },
      prevSettlementPaid: 5000,
      settled,
      derived: {
        settlementStatus: 'driver_owes',
        payoutStatus: 'finalized',
        periodStatus: 'closed',
        cashStillHeld: 0,
        tollsClear: true,
        moneyUnlocked: true,
      },
      financeCore: {
        overpaidAmount: settled.overpaidAmount,
        tollCashWashEligible: 0,
        tollsClear: true,
        moneyUnlocked: true,
        cashHeldClamped: false,
        unclampedCashHeld: 0,
      },
    });
    expect(meta.signedSnapshot).toEqual(priorSnap);
  });
});
