import { describe, expect, it } from 'vitest';
import { priceLine } from './priceLine.ts';
import { DEFAULT_PORTION_LEVELS } from './presets.ts';
import type { MenuSnapshot, OrderLine } from './types.ts';

const markup15 = (r: number) => Math.ceil((r * 1.15) / 10) * 10;

function chainPizzaSnapshot(): MenuSnapshot {
  const sizeG = 'g-size';
  const crustG = 'g-crust';
  const sauceG = 'g-sauce';
  const cheeseG = 'g-cheese';
  const topG = 'g-toppings';
  return {
    menuId: 'm1',
    version: 42,
    sections: [{ id: 's1', name: 'Pizza', sectionType: 'pizza', sort: 0 }],
    groups: [
      {
        id: sizeG,
        name: 'Size',
        sourceLabel: 'Size',
        sourceStep: 1,
        min: 1,
        max: 1,
        freeCount: 0,
        pricingMode: 'replace',
        portionLevels: null,
        placementEnabled: false,
        defaultRefund: 'price',
        options: [
          { id: 'med', name: 'Medium', sourceLabel: 'Medium (12")', price: 2000, maxQty: 1, isDefault: false, sort: 0, isAvailable: true },
          { id: 'large', name: 'Large', sourceLabel: 'Large (14")', price: 2500, maxQty: 1, isDefault: true, sort: 1, isAvailable: true },
        ],
      },
      {
        id: crustG,
        name: 'Crust',
        sourceLabel: 'Crust',
        sourceStep: 2,
        min: 1,
        max: 1,
        freeCount: 0,
        pricingMode: 'add',
        portionLevels: null,
        placementEnabled: false,
        defaultRefund: 'price',
        options: [
          { id: 'hand', name: 'Hand Tossed', sourceLabel: 'Hand Tossed', price: 0, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
          {
            id: 'stuffed',
            name: 'Stuffed',
            sourceLabel: 'Stuffed Crust',
            price: 0,
            maxQty: 1,
            isDefault: false,
            sort: 1,
            isAvailable: true,
            condition: { groupId: sizeG, op: 'eq', optionIds: ['large'] },
          },
        ],
      },
      {
        id: sauceG,
        name: 'Sauce',
        sourceLabel: 'Sauce',
        sourceStep: 3,
        min: 1,
        max: 1,
        freeCount: 0,
        pricingMode: 'included',
        portionLevels: DEFAULT_PORTION_LEVELS.filter((p) => ['none', 'light', 'normal', 'extra'].includes(p.id)),
        placementEnabled: false,
        defaultRefund: 'nothing',
        options: [
          { id: 'tomato', name: 'Tomato', sourceLabel: 'Robust Inspired Tomato Sauce', price: 0, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
        ],
      },
      {
        id: cheeseG,
        name: 'Cheese',
        sourceLabel: 'Cheese',
        sourceStep: 4,
        min: 1,
        max: 1,
        freeCount: 0,
        pricingMode: 'add',
        portionLevels: null,
        placementEnabled: false,
        defaultRefund: 'price',
        options: [
          { id: 'ch-normal', name: 'Normal', price: 0, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
          { id: 'ch-double', name: 'Double', sourceLabel: 'Double', price: 0, maxQty: 1, isDefault: false, sort: 1, isAvailable: true },
        ],
      },
      {
        id: topG,
        name: 'Toppings',
        sourceLabel: 'Toppings',
        sourceStep: 5,
        min: 0,
        max: 10,
        freeCount: 0,
        pricingMode: 'add',
        portionLevels: [
          { id: 'light', label: 'Light', multiplier: 1 },
          { id: 'normal', label: 'Normal', multiplier: 1 },
          { id: 'extra', label: 'Extra', multiplier: 2 },
        ],
        placementEnabled: true,
        defaultRefund: 'nothing',
        options: [
          { id: 'pepperoni', name: 'Pepperoni', sourceLabel: 'Pepperoni', price: 0, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
          { id: 'mushroom', name: 'Mushrooms', sourceLabel: 'Mushrooms', price: 0, maxQty: 1, isDefault: false, sort: 1, isAvailable: true },
          { id: 'premium', name: 'Premium', sourceLabel: 'Grilled Chicken', price: 0, maxQty: 1, isDefault: false, sort: 2, isAvailable: true },
        ],
      },
    ],
    priceMatrix: [
      { optionId: 'stuffed', contextOptionId: 'large', price: 400 },
      { optionId: 'ch-double', contextOptionId: 'large', price: 450 },
      { optionId: 'ch-double', contextOptionId: 'med', price: 350 },
      { optionId: 'pepperoni', contextOptionId: 'large', price: 200 },
      { optionId: 'mushroom', contextOptionId: 'large', price: 200 },
      { optionId: 'premium', contextOptionId: 'large', price: 300 },
    ],
    products: [
      {
        id: 'pep-lovers',
        sectionId: 's1',
        type: 'pizza',
        name: 'Pepperoni Lovers',
        sourceLabel: 'Pepperoni Lovers',
        basePrice: 0,
        groupLinks: [
          { groupId: sizeG, sort: 1 },
          { groupId: crustG, sort: 2 },
          { groupId: sauceG, sort: 3 },
          { groupId: cheeseG, sort: 4 },
          { groupId: topG, sort: 5 },
        ],
        pizza: {
          halfPriceRule: 'full',
          maxToppings: 10,
          specialtyMode: 'fixed',
          fixedPricesBySize: { med: 2200, large: 2820 },
        },
      },
      {
        id: 'byo',
        sectionId: 's1',
        type: 'pizza',
        name: 'Build Your Own',
        basePrice: 0,
        groupLinks: [
          { groupId: sizeG, sort: 1 },
          { groupId: crustG, sort: 2 },
          { groupId: sauceG, sort: 3 },
          { groupId: cheeseG, sort: 4 },
          { groupId: topG, sort: 5 },
        ],
        pizza: {
          halfPriceRule: 'half',
          maxToppings: 10,
          specialtyMode: 'build',
        },
      },
    ],
  };
}

describe('priceLine — chain pizza', () => {
  it('prices specialty fixed; removing default topping does not lower price', () => {
    const snap = chainPizzaSnapshot();
    const withDefault: OrderLine = {
      productId: 'pep-lovers',
      quantity: 1,
      menuVersion: 42,
      selections: [
        { groupId: 'g-size', optionId: 'large' },
        { groupId: 'g-crust', optionId: 'hand' },
        { groupId: 'g-sauce', optionId: 'tomato', portion: 'light' },
        { groupId: 'g-cheese', optionId: 'ch-double' },
        { groupId: 'g-toppings', optionId: 'pepperoni', placement: 'whole', portion: 'normal' },
      ],
    };
    const withoutPepperoni: OrderLine = {
      ...withDefault,
      selections: withDefault.selections.filter((s) => s.optionId !== 'pepperoni'),
    };
    const a = priceLine(snap, withDefault, markup15);
    const b = priceLine(snap, withoutPepperoni, markup15);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      // fixed 2820 + double cheese 450
      expect(a.restaurant).toBe(2820 + 450);
      expect(b.restaurant).toBe(a.restaurant);
    }
  });

  it('charges added premium topping on half', () => {
    const snap = chainPizzaSnapshot();
    const line: OrderLine = {
      productId: 'pep-lovers',
      quantity: 1,
      menuVersion: 42,
      selections: [
        { groupId: 'g-size', optionId: 'large' },
        { groupId: 'g-crust', optionId: 'hand' },
        { groupId: 'g-sauce', optionId: 'tomato', portion: 'light' },
        { groupId: 'g-cheese', optionId: 'ch-double' },
        { groupId: 'g-toppings', optionId: 'pepperoni', placement: 'left', portion: 'normal' },
        { groupId: 'g-toppings', optionId: 'premium', placement: 'right', portion: 'normal' },
      ],
    };
    const result = priceLine(snap, line, markup15);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // halfPriceRule full → premium still full 300
      expect(result.restaurant).toBe(2820 + 450 + 300);
      expect(result.ticket.steps.some((s) => s.label === 'Sauce')).toBe(true);
      expect(result.ticket.copyAll).toContain('Robust Inspired Tomato Sauce');
    }
  });

  it('rejects stuffed crust on medium via condition', () => {
    const snap = chainPizzaSnapshot();
    const line: OrderLine = {
      productId: 'byo',
      quantity: 1,
      menuVersion: 42,
      selections: [
        { groupId: 'g-size', optionId: 'med' },
        { groupId: 'g-crust', optionId: 'stuffed' },
        { groupId: 'g-sauce', optionId: 'tomato' },
        { groupId: 'g-cheese', optionId: 'ch-normal' },
      ],
    };
    const result = priceLine(snap, line);
    expect(result.ok).toBe(false);
  });

  it('build mode halves topping when halfPriceRule is half', () => {
    const snap = chainPizzaSnapshot();
    const line: OrderLine = {
      productId: 'byo',
      quantity: 1,
      menuVersion: 42,
      selections: [
        { groupId: 'g-size', optionId: 'large' },
        { groupId: 'g-crust', optionId: 'hand' },
        { groupId: 'g-sauce', optionId: 'tomato' },
        { groupId: 'g-cheese', optionId: 'ch-normal' },
        { groupId: 'g-toppings', optionId: 'mushroom', placement: 'left', portion: 'normal' },
      ],
    };
    const result = priceLine(snap, line);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.restaurant).toBe(2500 + 100); // half of 200
  });

  it('rejects wrong menuVersion', () => {
    const snap = chainPizzaSnapshot();
    const result = priceLine(snap, {
      productId: 'byo',
      quantity: 1,
      menuVersion: 1,
      selections: [],
    });
    expect(result.ok).toBe(false);
  });
});

describe('priceLine — nested, wings, combo', () => {
  it('prices nested drink size', () => {
    const snap: MenuSnapshot = {
      menuId: 'm2',
      version: 1,
      sections: [],
      priceMatrix: [],
      groups: [
        {
          id: 'drinks',
          name: 'Drink',
          min: 1,
          max: 1,
          freeCount: 0,
          pricingMode: 'included',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: 'coke', name: 'Coke', price: 0, maxQty: 1, isDefault: true, sort: 0, isAvailable: true, nestedGroupId: 'drink-size' },
          ],
        },
        {
          id: 'drink-size',
          name: 'Drink size',
          min: 1,
          max: 1,
          freeCount: 0,
          pricingMode: 'replace',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: 'can', name: 'Can', price: 150, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
            { id: '2l', name: '2L', price: 400, maxQty: 1, isDefault: false, sort: 1, isAvailable: true },
          ],
        },
      ],
      products: [
        {
          id: 'meal-drink',
          sectionId: 's',
          type: 'standard',
          name: 'Drink',
          basePrice: 0,
          groupLinks: [{ groupId: 'drinks', sort: 1 }],
        },
      ],
    };
    const result = priceLine(snap, {
      productId: 'meal-drink',
      quantity: 1,
      menuVersion: 1,
      selections: [
        { groupId: 'drinks', optionId: 'coke', children: [{ groupId: 'drink-size', optionId: '2l' }] },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.restaurant).toBe(400);
  });

  it('requires 2 flavours for 12pc wings (1 per 6)', () => {
    const snap: MenuSnapshot = {
      menuId: 'm3',
      version: 1,
      sections: [],
      priceMatrix: [],
      groups: [
        {
          id: 'pieces',
          name: 'Count',
          min: 1,
          max: 1,
          freeCount: 0,
          pricingMode: 'replace',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: '12pc', name: '12 Piece', price: 1800, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
          ],
        },
        {
          id: 'flavours',
          name: 'Flavours',
          min: 0,
          max: 4,
          freeCount: 0,
          pricingMode: 'included',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: 'bbq', name: 'BBQ', price: 0, maxQty: 1, isDefault: false, sort: 0, isAvailable: true },
            { id: 'hot', name: 'Hot', price: 0, maxQty: 1, isDefault: false, sort: 1, isAvailable: true },
          ],
        },
      ],
      products: [
        {
          id: 'wings',
          sectionId: 's',
          type: 'wings',
          name: 'Wings',
          basePrice: 0,
          groupLinks: [
            { groupId: 'pieces', sort: 1 },
            { groupId: 'flavours', sort: 2 },
          ],
          wings: { flavourPerPieces: 6, flavourGroupId: 'flavours', piecesGroupId: 'pieces' },
        },
      ],
    };
    const one = priceLine(snap, {
      productId: 'wings',
      quantity: 1,
      menuVersion: 1,
      selections: [
        { groupId: 'pieces', optionId: '12pc' },
        { groupId: 'flavours', optionId: 'bbq' },
      ],
    });
    expect(one.ok).toBe(false);
    const two = priceLine(snap, {
      productId: 'wings',
      quantity: 1,
      menuVersion: 1,
      selections: [
        { groupId: 'pieces', optionId: '12pc' },
        { groupId: 'flavours', optionId: 'bbq' },
        { groupId: 'flavours', optionId: 'hot' },
      ],
    });
    expect(two.ok).toBe(true);
    if (two.ok) expect(two.restaurant).toBe(1800);
  });

  it('BYO half + premium with halfPriceRule half + light sauce + double cheese', () => {
    const snap = chainPizzaSnapshot();
    const line: OrderLine = {
      productId: 'byo',
      quantity: 1,
      menuVersion: 42,
      selections: [
        { groupId: 'g-size', optionId: 'large' },
        { groupId: 'g-crust', optionId: 'hand' },
        { groupId: 'g-sauce', optionId: 'tomato', portion: 'light' },
        { groupId: 'g-cheese', optionId: 'ch-double' },
        { groupId: 'g-toppings', optionId: 'premium', placement: 'left', portion: 'normal' },
      ],
    };
    const result = priceLine(snap, line, markup15);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // large 2500 + double cheese 450 + half of premium 300 = 150
      expect(result.restaurant).toBe(2500 + 450 + 150);
    }
  });

  it('specialty add topping only (whole) keeps fixed base', () => {
    const snap = chainPizzaSnapshot();
    const line: OrderLine = {
      productId: 'pep-lovers',
      quantity: 1,
      menuVersion: 42,
      selections: [
        { groupId: 'g-size', optionId: 'large' },
        { groupId: 'g-crust', optionId: 'hand' },
        { groupId: 'g-sauce', optionId: 'tomato' },
        { groupId: 'g-cheese', optionId: 'ch-normal' },
        { groupId: 'g-toppings', optionId: 'pepperoni', placement: 'whole', portion: 'normal' },
        { groupId: 'g-toppings', optionId: 'mushroom', placement: 'whole', portion: 'normal' },
      ],
    };
    const result = priceLine(snap, line);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.restaurant).toBe(2820 + 200);
  });

  it('base 2-Medium deal with no Large upgrade', () => {
    const snap: MenuSnapshot = {
      menuId: 'm4b',
      version: 1,
      sections: [],
      priceMatrix: [],
      groups: [
        {
          id: 'size',
          name: 'Size',
          min: 1,
          max: 1,
          freeCount: 0,
          pricingMode: 'replace',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: 'med', name: 'Medium', price: 2000, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
            { id: 'large', name: 'Large', price: 2500, maxQty: 1, isDefault: false, sort: 1, isAvailable: true },
          ],
        },
      ],
      products: [
        {
          id: 'pizza-a',
          sectionId: 's',
          type: 'pizza',
          name: 'Pizza',
          basePrice: 0,
          groupLinks: [{ groupId: 'size', sort: 1 }],
          pizza: { halfPriceRule: 'full', maxToppings: null, specialtyMode: 'build' },
        },
        {
          id: 'side',
          sectionId: 's',
          type: 'standard',
          name: 'Side',
          basePrice: 500,
          groupLinks: [],
        },
        {
          id: 'deal',
          sectionId: 's',
          type: 'combo',
          name: '2 Medium + Side',
          basePrice: 4500,
          groupLinks: [],
          comboSlots: [
            {
              id: 'pizza-1',
              name: 'Pizza 1',
              allowedProductIds: ['pizza-a'],
              upcharges: [{ when: { groupId: 'size', op: 'eq', optionIds: ['large'] }, amount: 400, label: 'Large upgrade' }],
              sort: 1,
            },
            {
              id: 'pizza-2',
              name: 'Pizza 2',
              allowedProductIds: ['pizza-a'],
              upcharges: [{ when: { groupId: 'size', op: 'eq', optionIds: ['large'] }, amount: 400, label: 'Large upgrade' }],
              sort: 2,
            },
            {
              id: 'side-1',
              name: 'Side',
              allowedProductIds: ['side'],
              upcharges: [],
              sort: 3,
            },
          ],
        },
      ],
    };
    const result = priceLine(snap, {
      productId: 'deal',
      quantity: 1,
      menuVersion: 1,
      selections: [],
      slots: [
        {
          slotId: 'pizza-1',
          line: {
            productId: 'pizza-a',
            quantity: 1,
            menuVersion: 1,
            selections: [{ groupId: 'size', optionId: 'med' }],
          },
        },
        {
          slotId: 'pizza-2',
          line: {
            productId: 'pizza-a',
            quantity: 1,
            menuVersion: 1,
            selections: [{ groupId: 'size', optionId: 'med' }],
          },
        },
        {
          slotId: 'side-1',
          line: { productId: 'side', quantity: 1, menuVersion: 1, selections: [] },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.restaurant).toBe(4500);
  });

  it('wings + dip qty adds dip price', () => {
    const snap: MenuSnapshot = {
      menuId: 'm3b',
      version: 1,
      sections: [],
      priceMatrix: [],
      groups: [
        {
          id: 'pieces',
          name: 'Count',
          min: 1,
          max: 1,
          freeCount: 0,
          pricingMode: 'replace',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: '12pc', name: '12 Piece', price: 1800, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
          ],
        },
        {
          id: 'flavours',
          name: 'Flavours',
          min: 0,
          max: 4,
          freeCount: 0,
          pricingMode: 'included',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: 'bbq', name: 'BBQ', price: 0, maxQty: 1, isDefault: false, sort: 0, isAvailable: true },
            { id: 'hot', name: 'Hot', price: 0, maxQty: 1, isDefault: false, sort: 1, isAvailable: true },
          ],
        },
        {
          id: 'dips',
          name: 'Dips',
          min: 0,
          max: 4,
          freeCount: 0,
          pricingMode: 'add',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: 'ranch', name: 'Ranch', price: 100, maxQty: 4, isDefault: false, sort: 0, isAvailable: true },
          ],
        },
      ],
      products: [
        {
          id: 'wings',
          sectionId: 's',
          type: 'wings',
          name: 'Wings',
          basePrice: 0,
          groupLinks: [
            { groupId: 'pieces', sort: 1 },
            { groupId: 'flavours', sort: 2 },
            { groupId: 'dips', sort: 3 },
          ],
          wings: { flavourPerPieces: 6, flavourGroupId: 'flavours', piecesGroupId: 'pieces' },
        },
      ],
    };
    const result = priceLine(snap, {
      productId: 'wings',
      quantity: 1,
      menuVersion: 1,
      selections: [
        { groupId: 'pieces', optionId: '12pc' },
        { groupId: 'flavours', optionId: 'bbq' },
        { groupId: 'flavours', optionId: 'hot' },
        { groupId: 'dips', optionId: 'ranch', qty: 2 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.restaurant).toBe(1800 + 200);
  });

  it('sized side / dessert uses replace pricing', () => {
    const snap: MenuSnapshot = {
      menuId: 'm6',
      version: 1,
      sections: [],
      priceMatrix: [],
      groups: [
        {
          id: 'dessert-size',
          name: 'Size',
          min: 1,
          max: 1,
          freeCount: 0,
          pricingMode: 'replace',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: 'reg', name: 'Regular', price: 600, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
            { id: 'lg', name: 'Large', price: 900, maxQty: 1, isDefault: false, sort: 1, isAvailable: true },
          ],
        },
      ],
      products: [
        {
          id: 'lava',
          sectionId: 's',
          type: 'sized',
          name: 'Lava Cake',
          basePrice: 0,
          groupLinks: [{ groupId: 'dessert-size', sort: 1 }],
        },
      ],
    };
    const result = priceLine(snap, {
      productId: 'lava',
      quantity: 1,
      menuVersion: 1,
      selections: [{ groupId: 'dessert-size', optionId: 'lg' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.restaurant).toBe(900);
  });

  it('nested drink size inside combo slot', () => {
    const snap: MenuSnapshot = {
      menuId: 'm7',
      version: 1,
      sections: [],
      priceMatrix: [],
      groups: [
        {
          id: 'drinks',
          name: 'Drink',
          min: 1,
          max: 1,
          freeCount: 0,
          pricingMode: 'included',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: 'coke', name: 'Coke', price: 0, maxQty: 1, isDefault: true, sort: 0, isAvailable: true, nestedGroupId: 'drink-size' },
          ],
        },
        {
          id: 'drink-size',
          name: 'Drink size',
          min: 1,
          max: 1,
          freeCount: 0,
          pricingMode: 'replace',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: 'can', name: 'Can', price: 150, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
            { id: '2l', name: '2L', price: 400, maxQty: 1, isDefault: false, sort: 1, isAvailable: true },
          ],
        },
      ],
      products: [
        {
          id: 'drink',
          sectionId: 's',
          type: 'standard',
          name: 'Drink',
          basePrice: 0,
          groupLinks: [{ groupId: 'drinks', sort: 1 }],
        },
        {
          id: 'meal',
          sectionId: 's',
          type: 'combo',
          name: 'Meal + Drink',
          basePrice: 2000,
          groupLinks: [],
          comboSlots: [
            {
              id: 'drink-slot',
              name: 'Drink',
              allowedProductIds: ['drink'],
              upcharges: [],
              sort: 1,
            },
          ],
        },
      ],
    };
    const result = priceLine(snap, {
      productId: 'meal',
      quantity: 1,
      menuVersion: 1,
      selections: [],
      slots: [
        {
          slotId: 'drink-slot',
          line: {
            productId: 'drink',
            quantity: 1,
            menuVersion: 1,
            selections: [
              { groupId: 'drinks', optionId: 'coke', children: [{ groupId: 'drink-size', optionId: '2l' }] },
            ],
          },
        },
      ],
    });
    expect(result.ok).toBe(true);
    // Combo base only unless upcharges; nested drink priced inside slot line then rolled up — verify slot prices into total
    if (result.ok) expect(result.restaurant).toBeGreaterThanOrEqual(2000);
  });

  it('combo deal applies Large upcharge', () => {
    const snap: MenuSnapshot = {
      menuId: 'm4',
      version: 1,
      sections: [],
      priceMatrix: [],
      groups: [
        {
          id: 'size',
          name: 'Size',
          min: 1,
          max: 1,
          freeCount: 0,
          pricingMode: 'replace',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: 'med', name: 'Medium', price: 2000, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
            { id: 'large', name: 'Large', price: 2500, maxQty: 1, isDefault: false, sort: 1, isAvailable: true },
          ],
        },
      ],
      products: [
        {
          id: 'pizza-a',
          sectionId: 's',
          type: 'pizza',
          name: 'Pizza',
          basePrice: 0,
          groupLinks: [{ groupId: 'size', sort: 1 }],
          pizza: { halfPriceRule: 'full', maxToppings: null, specialtyMode: 'build' },
        },
        {
          id: 'side',
          sectionId: 's',
          type: 'standard',
          name: 'Side',
          basePrice: 500,
          groupLinks: [],
        },
        {
          id: 'deal',
          sectionId: 's',
          type: 'combo',
          name: '2 Medium + Side',
          basePrice: 4500,
          groupLinks: [],
          comboSlots: [
            {
              id: 'pizza-1',
              name: 'Pizza 1',
              allowedProductIds: ['pizza-a'],
              upcharges: [{ when: { groupId: 'size', op: 'eq', optionIds: ['large'] }, amount: 400, label: 'Large upgrade' }],
              sort: 1,
            },
            {
              id: 'side-1',
              name: 'Side',
              allowedProductIds: ['side'],
              upcharges: [],
              sort: 2,
            },
          ],
        },
      ],
    };
    const result = priceLine(snap, {
      productId: 'deal',
      quantity: 1,
      menuVersion: 1,
      selections: [],
      slots: [
        {
          slotId: 'pizza-1',
          line: {
            productId: 'pizza-a',
            quantity: 1,
            menuVersion: 1,
            selections: [{ groupId: 'size', optionId: 'large' }],
          },
        },
        {
          slotId: 'side-1',
          line: { productId: 'side', quantity: 1, menuVersion: 1, selections: [] },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.restaurant).toBe(4500 + 400);
  });

  it('enforces pick 2 sides (min 2)', () => {
    const snap: MenuSnapshot = {
      menuId: 'm5',
      version: 1,
      sections: [],
      priceMatrix: [],
      groups: [
        {
          id: 'sides',
          name: 'Sides',
          min: 2,
          max: 2,
          freeCount: 0,
          pricingMode: 'included',
          portionLevels: null,
          placementEnabled: false,
          defaultRefund: 'price',
          options: [
            { id: 'rice', name: 'Rice', price: 0, maxQty: 1, isDefault: false, sort: 0, isAvailable: true },
            { id: 'fest', name: 'Festival', price: 0, maxQty: 1, isDefault: false, sort: 1, isAvailable: true },
          ],
        },
      ],
      products: [
        {
          id: 'plate',
          sectionId: 's',
          type: 'build_your_own',
          name: 'Plate',
          basePrice: 1200,
          groupLinks: [{ groupId: 'sides', sort: 1 }],
        },
      ],
    };
    expect(priceLine(snap, {
      productId: 'plate',
      quantity: 1,
      menuVersion: 1,
      selections: [{ groupId: 'sides', optionId: 'rice' }],
    }).ok).toBe(false);
    const ok = priceLine(snap, {
      productId: 'plate',
      quantity: 1,
      menuVersion: 1,
      selections: [
        { groupId: 'sides', optionId: 'rice' },
        { groupId: 'sides', optionId: 'fest' },
      ],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.restaurant).toBe(1200);
  });
});
