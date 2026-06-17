import { describe, expect, it } from 'vitest';
import { isDriverCashPaymentTransaction } from './driverCashPayment';

describe('isDriverCashPaymentTransaction', () => {
  it('accepts current Payment_Received rows', () => {
    expect(
      isDriverCashPaymentTransaction({
        type: 'Payment_Received',
        category: 'Cash Collection',
        amount: 15000,
        description: 'Cash Payment from Driver',
        paymentMethod: 'Cash',
      }),
    ).toBe(true);
  });

  it('accepts legacy Revenue + Cash Collection rows', () => {
    expect(
      isDriverCashPaymentTransaction({
        type: 'Revenue',
        category: 'Cash Collection',
        amount: 5000,
        description: 'Weekly cash',
        paymentMethod: 'Cash',
      }),
    ).toBe(true);
  });

  it('accepts legacy description-only cash payment rows', () => {
    expect(
      isDriverCashPaymentTransaction({
        type: 'Revenue',
        category: 'Other Expenses',
        amount: 2000,
        description: 'Cash payment from driver — week 12',
        paymentMethod: 'Cash',
      }),
    ).toBe(true);
  });

  it('rejects fuel reimbursements', () => {
    expect(
      isDriverCashPaymentTransaction({
        type: 'Payment_Received',
        category: 'Fuel Reimbursement',
        amount: 300,
        description: 'Fuel Credit',
        paymentMethod: 'Cash',
      }),
    ).toBe(false);
  });
});
