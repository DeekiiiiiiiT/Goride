import { describe, expect, it } from 'vitest';
import { resolveOrderGct } from './gct.ts';

describe('resolveOrderGct', () => {
  it('taxes food and platform supplies separately', () => {
    const r = resolveOrderGct({
      discountedSubtotal: 1000,
      serviceFee: 150,
      deliveryFeePlatformAmount: 80,
      foodRatePercent: 16.5,
      platformRatePercent: 16.5,
    });
    expect(r.taxFoodJmd).toBe(165);
    expect(r.taxPlatformJmd).toBe(37.95);
    expect(r.tax).toBe(202.95);
  });

  it('zero food rate when merchant unregistered', () => {
    const r = resolveOrderGct({
      discountedSubtotal: 1000,
      serviceFee: 150,
      deliveryFeePlatformAmount: 80,
      foodRatePercent: 0,
      platformRatePercent: 16.5,
    });
    expect(r.taxFoodJmd).toBe(0);
    expect(r.taxPlatformJmd).toBe(37.95);
  });

  it('ignores negative platform delivery (promo absorb)', () => {
    const r = resolveOrderGct({
      discountedSubtotal: 1000,
      serviceFee: 150,
      deliveryFeePlatformAmount: -320,
      foodRatePercent: 16.5,
      platformRatePercent: 16.5,
    });
    expect(r.taxPlatformJmd).toBe(24.75); // 150 × 16.5% only
  });
});
