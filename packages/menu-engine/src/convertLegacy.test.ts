import { describe, expect, it } from 'vitest';
import { convertLegacyOptions, convertMerchantMenu } from './convertLegacy.ts';
import { priceLine } from './priceLine.ts';
import { pizzaRestaurantPrice, type PizzaMenu, type PizzaPick } from '../../merchant-ops/src/pizzaMenu.ts';

describe('convertLegacy', () => {
  it('maps choice kinds to pricing modes', () => {
    const { groups } = convertLegacyOptions([
      { id: 'a', name: 'Side', kind: 'included', options: [{ id: '1', name: 'Rice', priceAdjustment: 0 }] },
      { id: 'b', name: 'Size', kind: 'priced', options: [{ id: 's', name: 'Large', priceAdjustment: 900 }] },
      { id: 'c', name: 'Extras', kind: 'extra', maxSelections: 2, options: [{ id: 'e', name: 'Cheese', priceAdjustment: 100 }] },
    ], 'm');
    expect(groups.map((g) => g.pricingMode)).toEqual(['included', 'replace', 'add']);
  });

  it('converts pizza_menu and matches legacy build price', () => {
    const legacy: PizzaMenu = {
      sizes: [{ id: 'L', name: 'Large', basePrice: 2500 }],
      crusts: [{ id: 'ht', name: 'Hand Tossed', description: '', fees: { L: 0 } }],
      extraCheese: { L: 250 },
      sauces: [{ id: 't', name: 'Tomato' }],
      meats: [{ id: 'pep', name: 'Pepperoni', prices: { L: 200 } }],
      nonMeats: [],
    };
    const snap = convertMerchantMenu({
      menuId: 'm',
      version: 1,
      categories: [{ id: 'cat', name: 'Pizza', section_kind: 'pizza', pizza_menu: legacy }],
      items: [{
        id: 'item1',
        category_id: 'cat',
        name: 'Pep',
        pizza_recipe: { cheese: 'extra', sauceId: 't', crustId: 'ht', toppings: [{ id: 'pep', portion: 'extra' }] },
      }],
    });
    const product = snap.products.find((p) => p.id === 'item1')!;
    const byName = (name: string) => {
      const link = product.groupLinks.find((l) => snap.groups.find((g) => g.id === l.groupId)?.name === name);
      return link!.groupId;
    };
    const sizeG = byName('Size');
    const crustG = byName('Crust');
    const sauceG = byName('Sauce');
    const cheeseG = byName('Cheese');
    const topG = byName('Toppings');
    const cheeseExtra = snap.groups.find((g) => g.id === cheeseG)!.options.find((o) => o.name === 'Extra')!.id;
    const pick: PizzaPick = {
      sizeId: 'L',
      crustId: 'ht',
      cheese: 'extra',
      sauceId: 't',
      toppings: [{ id: 'pep', portion: 'extra' }],
    };
    const legacyPrice = pizzaRestaurantPrice(legacy, pick);
    expect(legacyPrice.ok).toBe(true);
    const engine = priceLine(snap, {
      productId: 'item1',
      quantity: 1,
      menuVersion: 1,
      selections: [
        { groupId: sizeG, optionId: 'L' },
        { groupId: crustG, optionId: 'ht' },
        { groupId: sauceG, optionId: 't' },
        { groupId: cheeseG, optionId: cheeseExtra },
        { groupId: topG, optionId: 'pep', portion: 'extra' },
      ],
    });
    expect(engine.ok).toBe(true);
    if (legacyPrice.ok && engine.ok) {
      expect(engine.restaurant).toBe(legacyPrice.restaurant);
    }
  });
});
