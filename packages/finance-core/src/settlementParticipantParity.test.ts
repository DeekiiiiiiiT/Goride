import { describe, expect, it } from 'vitest';
import {
  isSettlementParticipantTransaction,
  isTollChargeTransaction,
  periodKeyFor,
} from './index.ts';
import {
  isSettlementParticipantTransaction as jsParticipant,
  periodKeyFor as jsPeriodKeyFor,
} from '../../../scripts/lib/settlementParticipant.mjs';

describe('isSettlementParticipantTransaction', () => {
  it('includes cash, payout, write-off, and Toll Charge', () => {
    expect(
      isSettlementParticipantTransaction({
        type: 'Payment_Received',
        category: 'Cash Collection',
        amount: 100,
      }),
    ).toBe(true);
    expect(
      isSettlementParticipantTransaction({
        type: 'Payout',
        category: 'Driver Payouts',
        amount: 500,
      }),
    ).toBe(true);
    expect(
      isSettlementParticipantTransaction({
        type: 'Cash_Write_Off',
        category: 'Cash Write Off',
        amount: 50,
      }),
    ).toBe(true);
    expect(
      isSettlementParticipantTransaction({
        category: 'Toll Charge',
        amount: -200,
      }),
    ).toBe(true);
    expect(isTollChargeTransaction({ category: 'Toll Charge' })).toBe(true);
  });

  it('rejects fuel and tag balance', () => {
    expect(
      isSettlementParticipantTransaction({
        type: 'Payment_Received',
        category: 'Fuel Reimbursement',
        amount: 30,
      }),
    ).toBe(false);
    expect(
      isSettlementParticipantTransaction({
        type: 'Payment_Received',
        category: 'Cash Collection',
        amount: 10,
        paymentMethod: 'Tag Balance',
      }),
    ).toBe(false);
  });

  it('stays in lockstep with scripts/lib/settlementParticipant.mjs', () => {
    const samples = [
      { type: 'Payment_Received', category: 'Cash Collection', amount: 1 },
      { type: 'Payout', category: 'Driver Payouts', amount: 1 },
      { type: 'Cash_Write_Off', category: 'Cash Write Off', amount: 1 },
      { category: 'Toll Charge', amount: -1 },
      { type: 'Payment_Received', category: 'Fuel Reimbursement', amount: 1 },
      { type: 'Driver_Payout', category: 'Driver Payout', amount: 1 },
    ];
    for (const s of samples) {
      expect(jsParticipant(s)).toBe(isSettlementParticipantTransaction(s));
    }
    expect(jsPeriodKeyFor('2026-08-31')).toBe(periodKeyFor('2026-08-31'));
  });
});
