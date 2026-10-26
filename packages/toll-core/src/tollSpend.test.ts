import { describe, it, expect } from 'vitest';
import {
  cashWashTripSpendAmount,
  isOpenUnreconciledToll,
  ledgerDebitSpendAmount,
  uniqueTollRowsById,
} from './tollSpend.ts';

describe('tollSpend shared formula (TR-H1)', () => {
  it('ledger debit uses absolute negative amount only', () => {
    expect(ledgerDebitSpendAmount({ amount: -285 })).toBe(285);
    expect(ledgerDebitSpendAmount({ amount: 100 })).toBe(0);
    expect(ledgerDebitSpendAmount({ amount: 0 })).toBe(0);
  });

  it('cash-wash unlinked trip contributes to spend; pending does not', () => {
    const linked = new Set<string>();
    expect(
      cashWashTripSpendAmount(
        { id: 't1', tollCharges: 275, tollRefundResolution: { status: 'cash_wash' } },
        linked,
      ),
    ).toBe(275);
    expect(
      cashWashTripSpendAmount(
        { id: 't2', tollCharges: 275, tollRefundResolution: { status: 'pending' } },
        linked,
      ),
    ).toBe(0);
  });

  it('a resolved personal toll with no trip is spend once, not twice', () => {
    const personal = {
      id: '090bd599',
      amount: -275,
      isReconciled: true,
      tripId: null,
      resolution: 'personal',
    };
    expect(isOpenUnreconciledToll(personal)).toBe(false);
    const merged = uniqueTollRowsById([personal, { ...personal }]);
    const spend = merged.reduce((sum, tx) => sum + ledgerDebitSpendAmount(tx), 0);
    expect(merged).toHaveLength(1);
    expect(spend).toBe(275);
  });

  it('an open toll with no trip and no resolution stays unreconciled', () => {
    expect(isOpenUnreconciledToll({
      isReconciled: false,
      tripId: null,
      resolution: null,
      amount: -370,
    })).toBe(true);
  });

  it('linked cash-wash trip does not double-count spend', () => {
    expect(
      cashWashTripSpendAmount(
        { id: 't1', tollCharges: 275, tollRefundResolution: { status: 'cash_wash' } },
        new Set(['t1']),
      ),
    ).toBe(0);
  });
});
