import { describe, expect, it } from 'vitest';
import { assertCodTrialBalance, computeCodTrialBalance } from './codBalance.ts';

describe('computeCodTrialBalance', () => {
  it('v2 COD splits sum to total', () => {
    const balance = computeCodTrialBalance({
      subtotal: 1000,
      discount: 0,
      merchantCommissionAmount: 200,
      serviceFee: 150,
      deliveryFeePlatformAmount: 80,
      deliveryFeeCourierAmount: 320,
      taxFoodJmd: 165,
      taxPlatformJmd: 37.95,
      tax: 202.95,
      tip: 100,
      courierTipNet: 100,
      total: 1852.95,
      pricingModel: 'v2',
    });
    assertCodTrialBalance(balance, 1852.95);
    expect(balance.gctDueJmd).toBe(202.95);
    expect(balance.merchantDueJmd).toBe(800);
  });

  it('v2 free-delivery negative platform share — merchant not charged', () => {
    const balance = computeCodTrialBalance({
      subtotal: 2000,
      discount: 0,
      merchantCommissionAmount: 400,
      serviceFee: 200,
      deliveryFeePlatformAmount: -320,
      deliveryFeeCourierAmount: 320,
      taxFoodJmd: 330,
      taxPlatformJmd: 33,
      tip: 0,
      total: 2563,
      pricingModel: 'v2',
    });
    expect(balance.merchantDueJmd).toBe(1600);
    expect(balance.platformDueJmd).toBe(200 + 400 + (-320) + 363);
    expect(balance.courierRetainedJmd).toBe(320);
    assertCodTrialBalance(balance, 2563);
  });

  it('v2 small-order fee lands in platform take — three-way sums to total', () => {
    // J$900 food + J$400 small-order fee (below J$1,500 threshold)
    const balance = computeCodTrialBalance({
      subtotal: 900,
      discount: 0,
      merchantCommissionAmount: 225,
      serviceFee: 150,
      deliveryFeePlatformAmount: 80,
      deliveryFeeCourierAmount: 320,
      smallOrderFee: 400,
      taxFoodJmd: 148.5,
      taxPlatformJmd: 103.95,
      tip: 0,
      total: 2102.45,
      pricingModel: 'v2',
    });
    expect(balance.merchantDueJmd).toBe(675); // 900 - 225
    expect(balance.platformDueJmd).toBe(150 + 225 + 80 + 148.5 + 103.95 + 400);
    expect(balance.courierRetainedJmd).toBe(320);
    assertCodTrialBalance(balance, 2102.45);
  });
});
