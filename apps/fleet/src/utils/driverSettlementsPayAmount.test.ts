import { describe, expect, it } from 'vitest';
import { payOutstandingAmount } from './driverSettlementsPayAmount';

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
