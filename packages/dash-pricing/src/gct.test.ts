import { describe, expect, it } from 'vitest';
import { resolveOrderGct } from './gct.ts';

describe('resolveOrderGct', () => {
  it('taxes food and platform supplies separately', () => {
    const r = resolveOrderGct({
      discountedSubtotal: 1000,
      serviceFee: 150,
      deliveryFeePlatformAmount: 80,
      foodRatePercent: 15,
      platformRatePercent: 15,
    });
    expect(r.taxFoodJmd).toBe(150);
    expect(r.taxPlatformJmd).toBe(34.5);
    expect(r.tax).toBe(184.5);
  });

  it('zero food rate when merchant unregistered', () => {
    const r = resolveOrderGct({
      discountedSubtotal: 1000,
      serviceFee: 150,
      deliveryFeePlatformAmount: 80,
      foodRatePercent: 0,
      platformRatePercent: 15,
    });
    expect(r.taxFoodJmd).toBe(0);
    expect(r.taxPlatformJmd).toBe(34.5);
  });

  it('ignores negative platform delivery (promo absorb)', () => {
    const r = resolveOrderGct({
      discountedSubtotal: 1000,
      serviceFee: 150,
      deliveryFeePlatformAmount: -320,
      foodRatePercent: 15,
      platformRatePercent: 15,
    });
    expect(r.taxPlatformJmd).toBe(22.5); // 150 × 15% only
  });
});
