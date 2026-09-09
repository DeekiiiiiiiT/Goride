/**
 * Phase 1 — persist body after C-2/C-3 fixes (was characterization of bugs in Phase 0).
 */
import { describe, expect, it } from 'vitest';
import { buildCashSettlementPersistFields } from './periodPersistBody.ts';
import { computePeriodSettlement } from './driverPeriodSettlement.ts';

describe('buildCashSettlementPersistFields (C-2/C-3 fixed)', () => {
  it('persists signed settlementPaid and matching settlement_amount (C-2)', () => {
    const settled = computePeriodSettlement({
      driverShare: 5000,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: -1200,
    });
    expect(settled.settlementPaid).toBe(-1200);
    expect(settled.settlement).toBe(6200);

    const fields = buildCashSettlementPersistFields({
      cashReturned: 0,
      cashWrittenOff: 0,
      settled,
      derived: {
        settlementStatus: 'company_owes',
        payoutStatus: 'finalized',
        periodStatus: 'open',
        cashStillHeld: 0,
        tollsClear: true,
        moneyUnlocked: true,
      },
      metadata: {},
      now: '2026-09-08T12:00:00.000Z',
    });

    expect(fields.settlement_paid).toBe(-1200);
    expect(fields.settlement_amount).toBe(6200);
    expect(fields).not.toHaveProperty('status');
    expect(fields).not.toHaveProperty('closed_at');
  });

  it('writes reconciliation_status from derived periodStatus, not calendar close (C-3)', () => {
    const settled = computePeriodSettlement({
      driverShare: 100,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
    });
    const cleared = buildCashSettlementPersistFields({
      cashReturned: 0,
      cashWrittenOff: 0,
      settled,
      derived: {
        settlementStatus: 'settled',
        payoutStatus: 'finalized',
        periodStatus: 'closed',
        cashStillHeld: 0,
        tollsClear: true,
        moneyUnlocked: true,
      },
      metadata: {},
      now: '2026-09-08T12:00:00.000Z',
    });
    expect(cleared.reconciliation_status).toBe('cleared');

    const opened = buildCashSettlementPersistFields({
      cashReturned: 0,
      cashWrittenOff: 0,
      settled,
      derived: {
        settlementStatus: 'pending',
        payoutStatus: 'awaiting_tolls',
        periodStatus: 'open',
        cashStillHeld: 0,
        tollsClear: false,
        moneyUnlocked: false,
      },
      metadata: {},
      now: '2026-09-08T12:00:00.000Z',
    });
    expect(opened.reconciliation_status).toBe('open');
  });
});
