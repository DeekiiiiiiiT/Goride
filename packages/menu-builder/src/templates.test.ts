import { describe, expect, it } from 'vitest';
import type { MenuSnapshot } from '@roam/menu-engine';
import { addTemplateToSnapshot, instantiateTemplate, snapshotToTemplate, templateToSnapshot, type TemplatePayload } from './templates';

const SIZE_GROUP = '11111111-1111-4111-8111-111111111111';
const SMALL = '22222222-2222-4222-8222-222222222222';
const LARGE = '33333333-3333-4333-8333-333333333333';
const TOP_GROUP = '44444444-4444-4444-8444-444444444444';
const PEPPERONI = '55555555-5555-4555-8555-555555555555';
const PRODUCT = '66666666-6666-4666-8666-666666666666';

function pizzaTemplate(): TemplatePayload {
  return {
    product: {
      id: PRODUCT,
      sectionId: 'template-section',
      type: 'pizza',
      name: 'Build your own',
      basePrice: 0,
      groupLinks: [{ groupId: SIZE_GROUP, sort: 0 }, { groupId: TOP_GROUP, sort: 1 }],
      pizza: { halfPriceRule: 'full', maxToppings: 10, specialtyMode: 'fixed', fixedPricesBySize: { [SMALL]: 1000, [LARGE]: 2000 } },
    },
    groups: [
      {
        id: SIZE_GROUP, name: 'Size', min: 1, max: 1, freeCount: 0, pricingMode: 'replace', portionLevels: null,
        placementEnabled: false, defaultRefund: 'nothing',
        options: [
          { id: SMALL, name: 'Small', price: 1000, maxQty: 1, isDefault: true, sort: 0, isAvailable: true },
          { id: LARGE, name: 'Large', price: 2000, maxQty: 1, isDefault: false, sort: 1, isAvailable: true },
        ],
      },
      {
        id: TOP_GROUP, name: 'Toppings', min: 0, max: 10, freeCount: 0, pricingMode: 'add', portionLevels: null,
        placementEnabled: true, defaultRefund: 'nothing',
        condition: { groupId: SIZE_GROUP, op: 'in', optionIds: [SMALL, LARGE] },
        options: [{ id: PEPPERONI, name: 'Pepperoni', price: 200, maxQty: 1, isDefault: false, sort: 0, isAvailable: true }],
      },
    ],
    priceMatrix: [{ optionId: PEPPERONI, contextOptionId: LARGE, price: 300 }],
  };
}

describe('dish templates', () => {
  it('copies with fresh ids and rewires every reference', () => {
    const copy = instantiateTemplate(pizzaTemplate(), 'sec-1', 'Large deal');
    const [size, tops] = copy.groups;
    expect(copy.product.id).not.toBe(PRODUCT);
    expect(copy.product.sectionId).toBe('sec-1');
    expect(copy.product.name).toBe('Large deal');
    expect(size.id).not.toBe(SIZE_GROUP);
    expect(copy.product.groupLinks.map((l) => l.groupId)).toEqual([size.id, tops.id]);
    expect(tops.condition?.groupId).toBe(size.id);
    expect(tops.condition?.optionIds).toEqual(size.options.map((o) => o.id));
    expect(copy.priceMatrix[0]).toEqual({ optionId: tops.options[0].id, contextOptionId: size.options[1].id, price: 300 });
    expect(copy.product.pizza?.fixedPricesBySize).toEqual({ [size.options[0].id]: 1000, [size.options[1].id]: 2000 });
  });

  it('two dishes from one template share nothing', () => {
    const empty: MenuSnapshot = { menuId: 'm', version: 1, groups: [], priceMatrix: [], products: [], sections: [] };
    const one = addTemplateToSnapshot(empty, pizzaTemplate(), 's');
    const two = addTemplateToSnapshot(one.snapshot, pizzaTemplate(), 's');
    const groupIds = two.snapshot.groups.map((g) => g.id);
    expect(new Set(groupIds).size).toBe(4);
    expect(two.snapshot.products).toHaveLength(2);
  });

  it('round-trips through the editor snapshot and drops unused groups', () => {
    const snap = templateToSnapshot(pizzaTemplate());
    snap.groups.push({ ...snap.groups[0], id: 'unused' });
    const back = snapshotToTemplate(snap);
    expect(back.groups.map((g) => g.id)).toEqual([SIZE_GROUP, TOP_GROUP]);
    expect(back.priceMatrix).toHaveLength(1);
  });

  it('clears combo slot dish links', () => {
    const payload: TemplatePayload = {
      product: {
        id: PRODUCT, sectionId: 'x', type: 'combo', name: 'Meal', basePrice: 900, groupLinks: [],
        comboSlots: [{ id: 'slot', name: 'Main', allowedProductIds: ['other-dish'], upcharges: [], sort: 0 }],
      },
      groups: [],
      priceMatrix: [],
    };
    expect(instantiateTemplate(payload, 's').product.comboSlots?.[0].allowedProductIds).toEqual([]);
  });
});
