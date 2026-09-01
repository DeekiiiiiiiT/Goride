import { describe, expect, it } from 'vitest';
import {
  isCashReturnedForWeek,
  isCashWriteOffForWeek,
  isCashWriteOffTransaction,
  isClearedCashWriteOff,
  isClearedDriverCashPayment,
  isClearedDriverPayout,
  isDriverCashPaymentTransaction,
  isDriverPayoutTransaction,
  isPendingDriverPayoutForWeek,
  isSettlementPaidForWeek,
  isSettlementParticipantTransaction,
  isTollChargeTransaction,
} from './driverCashPayment';

describe('isSettlementParticipantTransaction', () => {
  it('includes write-off and Toll Charge', () => {
    expect(
      isSettlementParticipantTransaction({
        type: 'Cash_Write_Off',
        category: 'Cash Write Off',
        amount: 100,
      }),
    ).toBe(true);
    expect(isTollChargeTransaction({ category: 'Toll Charge' })).toBe(true);
    expect(isSettlementParticipantTransaction({ category: 'Toll Charge', amount: -50 })).toBe(true);
  });
});

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

  it('rejects Cash_Write_Off so it never inflates Cash Returned', () => {
    expect(
      isDriverCashPaymentTransaction({
        type: 'Cash_Write_Off',
        category: 'Cash Write Off',
        amount: 500,
        description: 'Cash write-off: lost float',
        paymentMethod: 'Other',
      }),
    ).toBe(false);
  });

  it('rejects Driver Payout so it never inflates Cash Returned', () => {
    expect(
      isDriverCashPaymentTransaction({
        type: 'Payout',
        category: 'Driver Payouts',
        amount: 1043.65,
        description: 'Driver payout via Cash',
        paymentMethod: 'Cash',
      }),
    ).toBe(false);
  });
});

describe('driver payout detectors', () => {
  it('accepts Payout / Driver Payouts', () => {
    expect(
      isDriverPayoutTransaction({
        type: 'Payout',
        category: 'Driver Payouts',
        amount: 500,
      }),
    ).toBe(true);
  });

  it('counts Cash Completed as cleared settlement paid for the week', () => {
    const tx = {
      type: 'Payout',
      category: 'Driver Payouts',
      amount: 1043.65,
      paymentMethod: 'Cash',
      status: 'Completed',
      metadata: { workPeriodStart: '2026-07-20T12:00:00.000Z', workPeriodEnd: '2026-07-26T12:00:00.000Z' },
    };
    expect(isClearedDriverPayout(tx)).toBe(true);
    expect(isSettlementPaidForWeek(tx as any, '2026-07-20')).toBe(true);
    expect(isSettlementPaidForWeek(tx as any, '2026-07-13')).toBe(false);
  });

  it('excludes Pending bank payout from settlement paid', () => {
    const tx = {
      type: 'Payout',
      category: 'Driver Payouts',
      amount: 500,
      paymentMethod: 'Bank Transfer',
      status: 'Pending',
      metadata: { workPeriodStart: '2026-07-20' },
    };
    expect(isClearedDriverPayout(tx)).toBe(false);
    expect(isSettlementPaidForWeek(tx as any, '2026-07-20')).toBe(false);
    expect(isPendingDriverPayoutForWeek(tx as any, '2026-07-20')).toBe(true);
  });
});

describe('cash write-off detectors', () => {
  it('accepts Cash_Write_Off / Cash Write Off', () => {
    expect(
      isCashWriteOffTransaction({
        type: 'Cash_Write_Off',
        category: 'Cash Write Off',
        amount: 250,
      }),
    ).toBe(true);
  });

  it('counts cleared write-off for the tagged Settlement Week only', () => {
    const wo = {
      type: 'Cash_Write_Off' as const,
      category: 'Cash Write Off',
      amount: 250,
      status: 'Completed',
      metadata: { workPeriodStart: '2026-06-29', workPeriodEnd: '2026-07-05' },
    };
    expect(isClearedCashWriteOff(wo)).toBe(true);
    expect(isCashWriteOffForWeek(wo, '2026-06-29')).toBe(true);
    expect(isCashWriteOffForWeek(wo, '2026-06-22')).toBe(false);
    expect(isCashReturnedForWeek(wo as any, '2026-06-29')).toBe(false);
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
