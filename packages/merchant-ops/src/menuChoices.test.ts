import { describe, expect, it } from 'vitest';
import {
  groupsFromStored,
  groupsToStored,
  orderChoiceError,
  stampChoiceList,
  validateDishChoices,
  type ChoiceGroup,
  type ChoiceList,
} from './menuChoices';

const side: ChoiceGroup = {
  id: 'side',
  name: 'Choose your side',
  kind: 'included',
  maxSelections: 1,
  options: [
    { id: 'rice', name: 'Rice', priceModifier: 0, isAvailable: true },
    { id: 'potato', name: 'Potato', priceModifier: 0, isAvailable: true },
  ],
};

const extra: ChoiceGroup = {
  id: 'extra',
  name: 'Add extras',
  kind: 'extra',
  maxSelections: 2,
  options: [
    { id: 'plantain', name: 'Plantain', priceModifier: 150, isAvailable: true },
  ],
};

describe('menu choices', () => {
  it('blocks a priced included choice and a blank name', () => {
    expect(validateDishChoices(-1, [])).toMatch(/negative/);
    expect(validateDishChoices(1000, [{ ...side, options: [{ ...side.options[0], priceModifier: 50 }] }])).toMatch(/free/);
    expect(validateDishChoices(1000, [{ ...extra, options: [{ ...extra.options[0], name: '' }] }])).toMatch(/name/);
  });

  it('stores an included choice as required and free', () => {
    const stored = groupsToStored([side, extra]);
    expect(stored[0]).toMatchObject({ required: true, maxSelections: 1, kind: 'included' });
    expect(stored[0].options[0].priceAdjustment).toBe(0);
    expect(stored[1]).toMatchObject({ required: false, maxSelections: 2, kind: 'extra' });
    expect(groupsFromStored(stored)[1].options[0].priceModifier).toBe(150);
  });

  it('updates every dish that uses a saved list', () => {
    const list: ChoiceList = {
      id: 'list-1',
      name: 'Standard sides',
      kind: 'included',
      maxSelections: 1,
      options: [{ id: 'rice', name: 'Rice and peas', priceModifier: 0, isAvailable: true }],
    };
    const stamped = stampChoiceList(groupsToStored([{ ...side, libraryGroupId: 'list-1' }]), list);
    expect(stamped.changed).toBe(true);
    expect((stamped.options[0] as { name: string }).name).toBe('Standard sides');
  });

  it('rejects a skipped side, too many extras, and a sold-out choice', () => {
    const stored = groupsToStored([side, extra]);
    expect(orderChoiceError(stored, [])).toMatch(/Choose your side/);
    expect(orderChoiceError(stored, [
      { id: 'rice' },
      { id: 'plantain' },
      { name: 'Plantain' },
      { id: 'plantain' },
    ])).toMatch(/only add 2/);
    const soldOut = groupsToStored([{ ...side, options: [{ ...side.options[0], isAvailable: false }, side.options[1]] }]);
    expect(orderChoiceError(soldOut, [{ id: 'rice' }])).toMatch(/sold-out/);
    expect(orderChoiceError(stored, [{ id: 'potato' }])).toBeNull();
  });

  it('treats a priced choice as the dish price and requires one', () => {
    const size: ChoiceGroup = {
      id: 'size',
      name: 'Size',
      kind: 'priced',
      maxSelections: 1,
      options: [
        { id: 'small', name: '20-oz', priceModifier: 200, isAvailable: true },
        { id: 'large', name: '2-Liter', priceModifier: 450, isAvailable: true },
      ],
    };
    expect(validateDishChoices(0, [size])).toBeNull();
    expect(validateDishChoices(0, [{ ...size, options: [{ ...size.options[0], priceModifier: 0 }] }])).toMatch(/restaurant price/);
    expect(validateDishChoices(0, [size, { ...size, id: 'again' }])).toMatch(/one price list/);
    const stored = groupsToStored([size]);
    expect(stored[0]).toMatchObject({ kind: 'priced', required: true, priceMode: 'replace' });
    expect(stored[0].options[1].priceAdjustment).toBe(450);
    expect(orderChoiceError(stored, [])).toMatch(/Choose Size/);
    expect(orderChoiceError(stored, [{ id: 'large' }])).toBeNull();
  });
});
