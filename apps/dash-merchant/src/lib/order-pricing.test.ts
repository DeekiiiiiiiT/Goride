import { describe, expect, it } from 'vitest';
import { calculateOrderPricing } from './order-pricing';

describe('calculateOrderPricing', () => {
  it('computes subtotal, tax, and total', () => {
    const result = calculateOrderPricing({
      lines: [
        { menuItemId: 'a', name: 'Burger', unitPrice: 1000, quantity: 2 },
        { menuItemId: 'b', name: 'Fries', unitPrice: 400, quantity: 1 },
      ],
      taxRatePercent: 10,
    });

    expect(result.subtotal).toBe(2400);
    expect(result.tax).toBe(240);
    expect(result.total).toBe(2640);
  });

  it('applies discount before tax', () => {
    const result = calculateOrderPricing({
      lines: [{ menuItemId: 'a', name: 'Burger', unitPrice: 1000, quantity: 1 }],
      taxRatePercent: 10,
      discount: 100,
    });

    expect(result.subtotal).toBe(1000);
    expect(result.tax).toBe(90);
    expect(result.total).toBe(990);
  });
});
