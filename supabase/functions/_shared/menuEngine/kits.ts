/** Starter kit payloads — also seeded into menu_kits. Ops can add kits without a release. */

export type MenuKitPayload = {
  sections: Array<{
    name: string;
    sectionType: string;
    products?: Array<{ name: string; type: string }>;
  }>;
  sharedGroups?: Array<{ name: string; pricingMode: string }>;
};

export type MenuKitDef = {
  id: string;
  cuisine: string;
  name: string;
  payload: MenuKitPayload;
};

export const BUILTIN_KITS: MenuKitDef[] = [
  {
    id: 'kit-pizza-chain',
    cuisine: 'Pizza',
    name: 'Pizza (chain-style)',
    payload: {
      sections: [
        { name: 'Pizza', sectionType: 'pizza' },
        { name: 'Wings', sectionType: 'wings' },
        { name: 'Sides', sectionType: 'standard' },
        { name: 'Desserts', sectionType: 'standard' },
        { name: 'Drinks', sectionType: 'sized' },
        { name: 'Deals', sectionType: 'combo' },
      ],
      sharedGroups: [
        { name: 'Sizes', pricingMode: 'replace' },
        { name: 'Crusts', pricingMode: 'add' },
        { name: 'Sauces', pricingMode: 'add' },
        { name: 'Cheese', pricingMode: 'add' },
        { name: 'Toppings', pricingMode: 'add' },
      ],
    },
  },
  {
    id: 'kit-jamaican',
    cuisine: 'Jamaican',
    name: 'Jamaican plates',
    payload: {
      sections: [
        { name: 'Plates', sectionType: 'build_your_own' },
        { name: 'Soups', sectionType: 'standard' },
        { name: 'Patties', sectionType: 'standard' },
        { name: 'Drinks', sectionType: 'sized' },
        { name: 'Pizza', sectionType: 'pizza' },
      ],
      sharedGroups: [
        { name: 'Plate size', pricingMode: 'replace' },
        { name: 'Sides', pricingMode: 'included' },
        { name: 'Gravy', pricingMode: 'included' },
      ],
    },
  },
  {
    id: 'kit-chinese',
    cuisine: 'Chinese',
    name: 'Chinese combos',
    payload: {
      sections: [
        { name: 'Combos', sectionType: 'combo' },
        { name: 'À la carte', sectionType: 'sized' },
        { name: 'Drinks', sectionType: 'sized' },
      ],
    },
  },
  {
    id: 'kit-burgers',
    cuisine: 'Fast food',
    name: 'Burgers & meals',
    payload: {
      sections: [
        { name: 'Burgers', sectionType: 'build_your_own' },
        { name: 'Sides', sectionType: 'standard' },
        { name: 'Drinks', sectionType: 'sized' },
      ],
    },
  },
  {
    id: 'kit-chicken',
    cuisine: 'Chicken',
    name: 'Chicken pieces & meals',
    payload: {
      sections: [
        { name: 'Pieces', sectionType: 'wings' },
        { name: 'Meals', sectionType: 'combo' },
        { name: 'Sides', sectionType: 'standard' },
      ],
    },
  },
  {
    id: 'kit-sushi',
    cuisine: 'Japanese',
    name: 'Sushi rolls & combos',
    payload: {
      sections: [
        { name: 'Rolls', sectionType: 'sized' },
        { name: 'Combos', sectionType: 'combo' },
        { name: 'Sides', sectionType: 'standard' },
      ],
    },
  },
  {
    id: 'kit-bakery',
    cuisine: 'Bakery',
    name: 'Café drinks & pastries',
    payload: {
      sections: [
        { name: 'Drinks', sectionType: 'sized' },
        { name: 'Pastries', sectionType: 'standard' },
      ],
    },
  },
];

export function kitsForCuisines(cuisines: string[]): MenuKitDef[] {
  const set = new Set(cuisines.map((c) => c.trim().toLowerCase()));
  return BUILTIN_KITS.filter((kit) => set.has(kit.cuisine.toLowerCase())
    || (set.has('pizza') && kit.id === 'kit-pizza-chain')
    || (set.has('jamaican') && kit.id === 'kit-jamaican'));
}
