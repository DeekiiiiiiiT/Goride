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

  it('legacy COD — platform holds GCT', () => {
    const balance = computeCodTrialBalance({
      subtotal: 1000,
      discount: 0,
      platformFee: 50,
      deliveryFee: 400,
      tax: 165,
      tip: 50,
      total: 1665,
      pricingModel: 'legacy',
    });
    assertCodTrialBalance(balance, 1665);
    expect(balance.platformDueJmd).toBe(215);
    expect(balance.merchantDueJmd).toBe(1000);
    expect(balance.courierRetainedJmd).toBe(450);
  });
});
