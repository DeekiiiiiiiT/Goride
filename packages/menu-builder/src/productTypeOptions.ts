import type { ProductType } from '@roam/menu-engine';

/**
 * How a customer orders a dish, in plain words. The ids are the engine's pricing rules
 * (stored in menus, so they never change); only these labels and hints are shown to staff.
 */
export const PRODUCT_TYPE_OPTIONS: Array<{ id: ProductType; label: string; hint: string }> = [
  {
    id: 'standard',
    label: 'Simple item',
    hint: 'One price, plus optional extras. Use this for most dishes.',
  },
  {
    id: 'sized',
    label: 'Choose a size',
    hint: 'Customer picks a size and the price changes (small / medium / large).',
  },
  {
    id: 'build_your_own',
    label: 'Step-by-step builder',
    hint: 'Customer picks in steps, e.g. base → protein → sides → extras (bowls, plates, burgers).',
  },
  {
    id: 'combo',
    label: 'Meal deal',
    hint: 'A deal made of other dishes on the menu, e.g. main + side + drink.',
  },
  {
    id: 'pizza',
    label: 'Half-and-half builder',
    hint: 'Pizza-style: toppings on the left, right or whole, with light / extra portions.',
  },
  {
    id: 'wings',
    label: 'Pieces + flavours',
    hint: 'Wings-style: pick a piece count, then a flavour for every few pieces.',
  },
];

const BY_ID = new Map(PRODUCT_TYPE_OPTIONS.map((t) => [t.id, t]));

export function productTypeLabel(id: string | null | undefined): string {
  return BY_ID.get((id || 'standard') as ProductType)?.label ?? String(id);
}

export function productTypeHint(id: string | null | undefined): string {
  return BY_ID.get((id || 'standard') as ProductType)?.hint ?? '';
}
