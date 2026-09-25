import { describe, it, expect } from 'vitest';
import { cashWashTripSpendAmount, ledgerDebitSpendAmount } from './tollSpend.ts';

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

  it('linked cash-wash trip does not double-count spend', () => {
    expect(
      cashWashTripSpendAmount(
        { id: 't1', tollCharges: 275, tollRefundResolution: { status: 'cash_wash' } },
        new Set(['t1']),
      ),
    ).toBe(0);
  });
});
