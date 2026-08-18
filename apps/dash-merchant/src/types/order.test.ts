import { describe, expect, it } from 'vitest';
import { getItemOptionLines, normalizeOrder, normalizeOrderItems } from './order';

describe('order item normalize (ROAM-DASH-MERCHANT-4)', () => {
  it('drops null line items so item.name never throws', () => {
    const items = normalizeOrderItems([
      { name: 'Jerk chicken', quantity: 1, price: 1200 },
      null,
      undefined,
    ]);
    expect(items).toEqual([{ name: 'Jerk chicken', quantity: 1, price: 1200 }]);
  });

  it('skips null modifiers when reading option names', () => {
    const lines = getItemOptionLines({
      name: 'Burger',
      quantity: 1,
      price: 10,
      options: [
        null as unknown as { name: string; selections: Array<{ name: string; priceAdjustment: number }> },
        {
          name: 'Side',
          selections: [{ name: 'Fries', priceAdjustment: 0 }, null as unknown as { name: string; priceAdjustment: number }],
        },
      ],
    });
    expect(lines).toEqual(['Side: Fries']);
  });

  it('fills items on a sparse order payload', () => {
    const order = normalizeOrder({
      id: 'o1',
      items: [null, { name: 'Soup', quantity: 2, price: 400 }],
    });
    expect(order.items).toHaveLength(1);
    expect(order.items[0].name).toBe('Soup');
  });
});
