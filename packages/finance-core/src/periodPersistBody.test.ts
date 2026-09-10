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
    expect(fields.reconciliation_status).toBe('cleared');
    expect(fields).not.toHaveProperty('status');
    expect(fields).not.toHaveProperty('closed_at');
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

  it('buildPeriodMetadata preserves service-line trip counts across cash sync (N-8)', () => {
    const settled = computePeriodSettlement({
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 2000,
      baseCashPaid: 500,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 0,
    });
    const meta = buildPeriodMetadata({
      priorMeta: {
        rushTripCount: 3,
        rideshareTripCount: 0,
        financeCore: { overpaidAmount: 1 },
      },
      prevSettlementPaid: 0,
      settled,
      derived: {
        settlementStatus: 'driver_owes',
        payoutStatus: 'finalized',
        periodStatus: 'open',
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
    expect(meta.rushTripCount).toBe(3);
    expect(meta.rideshareTripCount).toBe(0);
  });

  it('buildPeriodMetadata preserves cashSourceAck across rebuild', () => {
    const settled = computePeriodSettlement({
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 1000,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
    });
    const ack = {
      at: '2026-09-10T12:00:00.000Z',
      by: 'ops',
      reason: 'Statement cash trusted',
      uberCash: 100,
      uberTripCash: 80,
      mismatchAtAck: 20,
    };
    const meta = buildPeriodMetadata({
      priorMeta: {
        financeCore: {
          cashSourceMismatch: 20,
          uberCash: 100,
          uberTripCash: 80,
          cashSourceAck: ack,
        },
      },
      prevSettlementPaid: 0,
      settled,
      derived: {
        settlementStatus: 'settled',
        payoutStatus: 'finalized',
        periodStatus: 'open',
        cashStillHeld: 0,
        tollsClear: true,
        moneyUnlocked: true,
      },
      financeCore: {
        uberCash: 100,
        uberTripCash: 80,
        cashSourceMismatch: 20,
        overpaidAmount: 0,
        tollCashWashEligible: 0,
        tollsClear: true,
        moneyUnlocked: true,
        cashHeldClamped: false,
        unclampedCashHeld: 0,
      },
    });
    expect((meta.financeCore as { cashSourceAck?: unknown }).cashSourceAck).toEqual(ack);
  });
});
