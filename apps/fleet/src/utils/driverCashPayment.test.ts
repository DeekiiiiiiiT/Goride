import { describe, expect, it } from 'vitest';
import {
  isCashReturnedForWeek,
  isClearedDriverCashPayment,
  isDriverCashPaymentTransaction,
} from './driverCashPayment';

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

describe('isClearedDriverCashPayment / isCashReturnedForWeek', () => {
  it('excludes Pending bank transfers from Cash Returned', () => {
    const pendingBank = {
      type: 'Payment_Received' as const,
      category: 'Cash Collection',
      amount: 5000,
      description: 'Bank transfer',
      paymentMethod: 'Bank Transfer',
      status: 'Pending',
      metadata: { workPeriodStart: '2026-06-29', workPeriodEnd: '2026-07-05' },
    };
    expect(isClearedDriverCashPayment(pendingBank)).toBe(false);
    expect(isCashReturnedForWeek(pendingBank as any, '2026-06-29')).toBe(false);
  });

  it('counts Verified bank transfer tagged to the exact Monday week', () => {
    const verified = {
      type: 'Payment_Received' as const,
      category: 'Cash Collection',
      amount: 5000,
      description: 'Bank transfer',
      paymentMethod: 'Bank Transfer',
      status: 'Verified',
      metadata: { workPeriodStart: '2026-06-29T12:00:00.000Z', workPeriodEnd: '2026-07-05T12:00:00.000Z' },
    };
    expect(isClearedDriverCashPayment(verified)).toBe(true);
    expect(isCashReturnedForWeek(verified as any, '2026-06-29')).toBe(true);
    expect(isCashReturnedForWeek(verified as any, '2026-06-22')).toBe(false);
  });

  it('counts Completed cash as cleared', () => {
    expect(
      isClearedDriverCashPayment({
        type: 'Payment_Received',
        category: 'Cash Collection',
        amount: 7500,
        description: 'Cash',
        paymentMethod: 'Cash',
        status: 'Completed',
      }),
    ).toBe(true);
  });
});
