import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calculateOrderPricing } from './orderPricing.ts';

Deno.test('calculateOrderPricing — modifier lines', () => {
  const result = calculateOrderPricing({
    lines: [
      {
        menuItemId: 'burger',
        name: 'Burger',
        unitPrice: 1200,
        quantity: 1,
        modifiers: [{ name: 'Cheese', priceAdjustment: 150 }],
      },
    ],
    taxRatePercent: 15,
  });

  assertEquals(result.subtotal, 1350);
  assertEquals(result.tax, 202.5);
  assertEquals(result.total, 1552.5);
});
