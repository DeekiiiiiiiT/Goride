/**
 * Parity: every converted legacy dish must price the same under priceLine as today's helpers.
 */
import { describe, expect, it } from 'vitest';
import { convertMerchantMenu } from './convertLegacy.ts';
import { priceLine } from './priceLine.ts';
import {
  groupsFromStored,
  orderChoiceError,
} from '../../merchant-ops/src/menuChoices.ts';
import { pizzaRestaurantPrice, type PizzaMenu, type PizzaPick } from '../../merchant-ops/src/pizzaMenu.ts';

describe('migration parity', () => {
  it('standard priced + extras match applied base + modifiers', () => {
    const options = [
      {
        id: 'size',
        name: 'Size',
        kind: 'priced',
        required: true,
        maxSelections: 1,
        options: [
          { id: 'sm', name: 'Small', priceAdjustment: 800 },
          { id: 'lg', name: 'Large', priceAdjustment: 1200 },
        ],
      },
      {
        id: 'ex',
        name: 'Extras',
        kind: 'extra',
        required: false,
        maxSelections: 2,
        options: [{ id: 'cheese', name: 'Cheese', priceAdjustment: 100 }],
      },
    ];
    const snap = convertMerchantMenu({
      menuId: 'm',
      version: 1,
      categories: [{ id: 'c', name: 'Mains', section_kind: 'standard' }],
      items: [{ id: 'dish', category_id: 'c', name: 'Burger', in_store_price: 800, options }],
    });
    const product = snap.products[0];
    const sizeG = product.groupLinks[0].groupId;
    const exG = product.groupLinks[1].groupId;
    const engine = priceLine(snap, {
      productId: 'dish',
      quantity: 1,
      menuVersion: 1,
      selections: [
        { groupId: sizeG, optionId: 'lg' },
        { groupId: exG, optionId: 'cheese' },
      ],
    });
    expect(orderChoiceError(options, [{ id: 'lg' }, { id: 'cheese' }])).toBeNull();
    expect(engine.ok).toBe(true);
    if (engine.ok) expect(engine.restaurant).toBe(1200 + 100);
    expect(groupsFromStored(options)).toHaveLength(2);
  });

  it('Domino-style pizza fixture matches legacy pizzaRestaurantPrice', () => {
    const pizzaMenu: PizzaMenu = {
      sizes: [
        { id: 'M', name: 'Medium', basePrice: 2000 },
        { id: 'L', name: 'Large', basePrice: 2500 },
      ],
      crusts: [
        { id: 'ht', name: 'Hand Tossed', description: '', fees: { M: 0, L: 0 } },
        { id: 'thin', name: 'Thin', description: '', fees: { M: 0, L: 0 } },
      ],
      extraCheese: { M: 200, L: 250 },
      sauces: [{ id: 'tomato', name: 'Tomato' }],
      meats: [{ id: 'pep', name: 'Pepperoni', prices: { M: 150, L: 200 } }],
      nonMeats: [{ id: 'msh', name: 'Mushroom', prices: { M: 150, L: 200 } }],
    };
    const snap = convertMerchantMenu({
      menuId: 'dom',
      version: 1,
      categories: [{ id: 'pizza', name: 'Pizza', section_kind: 'pizza', pizza_menu: pizzaMenu }],
      items: [
        {
          id: 'pep-pizza',
          category_id: 'pizza',
          name: 'Pepperoni',
          pizza_recipe: {
            cheese: 'normal',
            sauceId: 'tomato',
            crustId: 'ht',
            toppings: [{ id: 'pep', portion: 'normal' }],
          },
        },
      ],
    });
    const product = snap.products[0];
    const g = (name: string) => product.groupLinks.find((l) => snap.groups.find((x) => x.id === l.groupId)?.name === name)!.groupId;
    const pick: PizzaPick = {
      sizeId: 'L',
      crustId: 'ht',
      cheese: 'extra',
      sauceId: 'tomato',
      toppings: [
        { id: 'pep', portion: 'extra' },
        { id: 'msh', portion: 'normal' },
      ],
    };
    const legacy = pizzaRestaurantPrice(pizzaMenu, pick);
    const cheeseG = g('Cheese');
    const cheeseExtra = snap.groups.find((x) => x.id === cheeseG)!.options.find((o) => o.name === 'Extra')!.id;
    const engine = priceLine(snap, {
      productId: 'pep-pizza',
      quantity: 1,
      menuVersion: 1,
      selections: [
        { groupId: g('Size'), optionId: 'L' },
        { groupId: g('Crust'), optionId: 'ht' },
        { groupId: g('Sauce'), optionId: 'tomato' },
        { groupId: cheeseG, optionId: cheeseExtra },
        { groupId: g('Toppings'), optionId: 'pep', portion: 'extra' },
        { groupId: g('Toppings'), optionId: 'msh', portion: 'normal' },
      ],
    });
    expect(legacy.ok).toBe(true);
    expect(engine.ok).toBe(true);
    if (legacy.ok && engine.ok) expect(engine.restaurant).toBe(legacy.restaurant);
  });

  it('full Domino-style menu: every converted dish prices under the engine', () => {
    const pizzaMenu: PizzaMenu = {
      sizes: [
        { id: 'M', name: 'Medium', basePrice: 2000 },
        { id: 'L', name: 'Large', basePrice: 2500 },
      ],
      crusts: [
        { id: 'ht', name: 'Hand Tossed', description: '', fees: { M: 0, L: 0 } },
      ],
      extraCheese: { M: 200, L: 250 },
      sauces: [{ id: 'tomato', name: 'Tomato' }],
      meats: [
        { id: 'pep', name: 'Pepperoni', prices: { M: 150, L: 200 } },
        { id: 'sausage', name: 'Sausage', prices: { M: 150, L: 200 } },
      ],
      nonMeats: [
        { id: 'msh', name: 'Mushroom', prices: { M: 150, L: 200 } },
        { id: 'onion', name: 'Onion', prices: { M: 150, L: 200 } },
      ],
    };
    const recipe = {
      cheese: 'normal' as const,
      sauceId: 'tomato',
      crustId: 'ht',
      toppings: [{ id: 'pep', portion: 'normal' as const }],
    };
    const dishes = Array.from({ length: 15 }, (_, i) => ({
      id: `dish-${i + 1}`,
      category_id: i < 12 ? 'pizza' : 'sides',
      name: i < 12 ? `Pizza ${i + 1}` : `Side ${i - 11}`,
      in_store_price: i < 12 ? 0 : 500 + i * 10,
      prep_time_mins: 15,
      source_price_checked_at: '2026-10-17T00:00:00.000Z',
      ...(i < 12
        ? { pizza_recipe: { ...recipe, toppings: [{ id: i % 2 === 0 ? 'pep' : 'msh', portion: 'normal' as const }] } }
        : {
            options: [
              {
                id: 'size',
                name: 'Size',
                kind: 'priced',
                required: true,
                maxSelections: 1,
                options: [
                  { id: 'reg', name: 'Regular', priceAdjustment: 500 + i * 10 },
                  { id: 'lg', name: 'Large', priceAdjustment: 700 + i * 10 },
                ],
              },
            ],
          }),
    }));
    const snap = convertMerchantMenu({
      menuId: 'domino-full',
      version: 1,
      categories: [
        { id: 'pizza', name: 'Pizza', section_kind: 'pizza', pizza_menu: pizzaMenu },
        { id: 'sides', name: 'Sides', section_kind: 'standard' },
      ],
      items: dishes,
    });
    expect(snap.products).toHaveLength(15);
    for (const product of snap.products) {
      if (product.type === 'pizza') {
        const sizeG = product.groupLinks[0].groupId;
        const crustG = product.groupLinks[1].groupId;
        const sauceG = product.groupLinks[2].groupId;
        const cheeseG = product.groupLinks[3].groupId;
        const topG = product.groupLinks[4].groupId;
        const cheeseNormal = snap.groups.find((g) => g.id === cheeseG)!.options.find((o) => o.name === 'Normal')!.id;
        const defaultTop = snap.groups.find((g) => g.id === topG)!.options.find((o) => o.isDefault)?.id;
        const engine = priceLine(snap, {
          productId: product.id,
          quantity: 1,
          menuVersion: 1,
          selections: [
            { groupId: sizeG, optionId: 'L' },
            { groupId: crustG, optionId: 'ht' },
            { groupId: sauceG, optionId: 'tomato' },
            { groupId: cheeseG, optionId: cheeseNormal },
            ...(defaultTop ? [{ groupId: topG, optionId: defaultTop, portion: 'normal' as const }] : []),
          ],
        });
        expect(engine.ok, product.name).toBe(true);
        if (engine.ok) {
          const legacy = pizzaRestaurantPrice(pizzaMenu, {
            sizeId: 'L',
            crustId: 'ht',
            cheese: 'normal',
            sauceId: 'tomato',
            toppings: defaultTop ? [{ id: defaultTop, portion: 'normal' }] : [],
          });
          expect(legacy.ok).toBe(true);
          if (legacy.ok) expect(engine.restaurant).toBe(legacy.restaurant);
        }
      } else {
        const sizeG = product.groupLinks[0].groupId;
        const engine = priceLine(snap, {
          productId: product.id,
          quantity: 1,
          menuVersion: 1,
          selections: [{ groupId: sizeG, optionId: 'lg' }],
        });
        expect(engine.ok, product.name).toBe(true);
      }
    }
  });
});
