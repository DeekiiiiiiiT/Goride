import { describe, expect, it } from 'vitest';
import { payOutstandingAmount, resolvePayQueueOwed } from './driverSettlementsPayAmount';

describe('payOutstandingAmount', () => {
  it('uses stored residual and does not subtract settlementPaid again', () => {
    // Aug 10 pattern: residual 3525.24 already after 4811.90 paid
    expect(payOutstandingAmount({ settlementAmount: 3525.24 })).toBe(3525.24);
    expect(payOutstandingAmount({ settlementAmount: 5301.11 })).toBe(5301.11);
  });

  it('floors non-positive residuals at 0', () => {
    expect(payOutstandingAmount({ settlementAmount: 0 })).toBe(0);
    expect(payOutstandingAmount({ settlementAmount: -10 })).toBe(0);
    expect(payOutstandingAmount({})).toBe(0);
  });
});

describe('resolvePayQueueOwed', () => {
  it('Kenny-shaped: ignores amountOwed that double-subtracted settlementPaid', () => {
    const row = {
      settlementAmount: 8261.56,
      settlementPaid: 2425.36,
      amountOwed: 5836.2, // wrong: 8261.56 - 2425.36
      amountOwedMinor: 583620,
    };
    expect(resolvePayQueueOwed(row)).toBe(8261.56);
    expect(resolvePayQueueOwed(row)).not.toBe(row.amountOwed);
  });
});
