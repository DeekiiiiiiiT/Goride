import { describe, expect, it } from 'vitest';
import { calculateOrderPricing, resolvePosTaxRatePercent } from './order-pricing.ts';

describe('resolvePosTaxRatePercent', () => {
  it('returns 0 when unregistered', () => {
    expect(resolvePosTaxRatePercent({ gctRegistered: false })).toBe(0);
  });

  it('throws when registered and rate missing', () => {
    expect(() => resolvePosTaxRatePercent({ gctRegistered: true })).toThrow(/required/);
    expect(() => resolvePosTaxRatePercent({ gctRegistered: true, taxRatePercent: null })).toThrow();
  });

  it('returns rate when registered', () => {
    expect(resolvePosTaxRatePercent({ gctRegistered: true, taxRatePercent: 15 })).toBe(15);
  });
});

describe('calculateOrderPricing', () => {
  it('applies tax for registered merchant', () => {
    const result = calculateOrderPricing({
      lines: [{ unitPrice: 1000, quantity: 1 }],
      taxRatePercent: 15,
      gctRegistered: true,
    });
    expect(result.subtotal).toBe(1000);
    expect(result.tax).toBe(150);
    expect(result.total).toBe(1150);
  });

  it('zero tax when unregistered', () => {
    const result = calculateOrderPricing({
      lines: [{ unitPrice: 1000, quantity: 1 }],
      taxRatePercent: 15,
      gctRegistered: false,
    });
    expect(result.tax).toBe(0);
    expect(result.total).toBe(1000);
  });

  it('throws when registered and rate missing — never silent 0%', () => {
    expect(() =>
      calculateOrderPricing({
        lines: [{ unitPrice: 1000, quantity: 1 }],
        gctRegistered: true,
      }),
    ).toThrow(/required/);
  });
});
