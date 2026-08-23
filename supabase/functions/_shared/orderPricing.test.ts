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
    taxRatePercent: 16.5,
    discount: 0,
  });
  assertEquals(result.subtotal, 1350);
  assertEquals(result.tax, 222.75);
  assertEquals(result.total, 1572.75);
});

Deno.test('calculateOrderPricing — zero tax when not GCT registered', () => {
  const result = calculateOrderPricing({
    lines: [
      { menuItemId: 'a', name: 'A', unitPrice: 100, quantity: 3 },
      { menuItemId: 'b', name: 'B', unitPrice: 50, quantity: 2 },
    ],
    taxRatePercent: 16.5,
    gctRegistered: false,
  });
  assertEquals(result.subtotal, 400);
  assertEquals(result.total, 400);
});

Deno.test('calculateOrderPricing — Jamaica GCT 16.5% on food subtotal', () => {
  const result = calculateOrderPricing({
    lines: [
      { menuItemId: 'item-1', name: 'Jerk', unitPrice: 1000, quantity: 2 },
    ],
    taxRatePercent: 16.5,
    discount: 0,
  });
  assertEquals(result.subtotal, 2000);
  assertEquals(result.tax, 330);
  assertEquals(result.total, 2330);
});
