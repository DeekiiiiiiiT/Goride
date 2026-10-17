/**
 * Convert today's JSON blobs (options, pizza_menu, pizza_recipe, choice lists)
 * into engine snapshot pieces. Used by migration + parity tests.
 */
import { pricingModeFromLegacyKind, DEFAULT_PORTION_LEVELS } from './presets.ts';
import type {
  MenuOption,
  MenuProduct,
  MenuSection,
  MenuSnapshot,
  OptionGroup,
  OptionPriceCell,
  OrderSelection,
  PizzaConfig,
} from './types.ts';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

type LegacyChoiceOption = {
  id?: string;
  name?: string;
  label?: string;
  priceAdjustment?: number;
  priceModifier?: number;
  isAvailable?: boolean;
};

type LegacyChoiceGroup = {
  id?: string;
  name?: string;
  title?: string;
  kind?: 'included' | 'priced' | 'extra';
  required?: boolean;
  maxSelections?: number;
  libraryGroupId?: string;
  options?: LegacyChoiceOption[];
};

/** Legacy menu_items.options → referenced option groups + product links. */
export function convertLegacyOptions(
  raw: unknown,
  menuId: string,
): { groups: OptionGroup[]; groupIds: string[] } {
  if (!Array.isArray(raw)) return { groups: [], groupIds: [] };
  const groups: OptionGroup[] = [];
  const groupIds: string[] = [];
  for (const entry of raw as LegacyChoiceGroup[]) {
    const kind = entry.kind === 'included' || entry.kind === 'priced' || entry.kind === 'extra'
      ? entry.kind
      : entry.required === false ? 'extra' : 'included';
    const id = text(entry.id) || newId('grp');
    const options: MenuOption[] = (entry.options || []).map((opt, i) => ({
      id: text(opt.id) || newId('opt'),
      name: text(opt.name) || text(opt.label) || `Option ${i + 1}`,
      price: Math.max(0, Number(opt.priceAdjustment ?? opt.priceModifier) || 0),
      maxQty: 1,
      isDefault: false,
      sort: i,
      isAvailable: opt.isAvailable !== false,
    }));
    const max = Number(entry.maxSelections);
    groups.push({
      id,
      name: text(entry.name) || text(entry.title) || 'Choices',
      min: kind === 'extra' ? 0 : 1,
      max: kind === 'extra' ? (Number.isFinite(max) ? Math.max(0, max) : 0) : 1,
      freeCount: 0,
      pricingMode: pricingModeFromLegacyKind(kind),
      portionLevels: null,
      placementEnabled: false,
      defaultRefund: 'price',
      options,
    });
    groupIds.push(id);
  }
  return { groups, groupIds };
}

type LegacyPizzaMenu = {
  sizes?: Array<{ id: string; name: string; basePrice: number }>;
  crusts?: Array<{ id: string; name: string; fees?: Record<string, number | null> }>;
  extraCheese?: Record<string, number>;
  sauces?: Array<{ id: string; name: string }>;
  meats?: Array<{ id: string; name: string; prices?: Record<string, number> }>;
  nonMeats?: Array<{ id: string; name: string; prices?: Record<string, number> }>;
};

export type ConvertedPizza = {
  groups: OptionGroup[];
  priceMatrix: OptionPriceCell[];
  sizeGroupId: string;
  crustGroupId: string;
  sauceGroupId: string;
  cheeseGroupId: string;
  toppingsGroupId: string;
  pizzaConfig: PizzaConfig;
};

/** Legacy category.pizza_menu → shared groups + size price matrix. */
export function convertLegacyPizzaMenu(raw: LegacyPizzaMenu | null | undefined): ConvertedPizza | null {
  if (!raw?.sizes?.length || !raw.crusts?.length) return null;
  const sizeGroupId = newId('size');
  const crustGroupId = newId('crust');
  const sauceGroupId = newId('sauce');
  const cheeseGroupId = newId('cheese');
  const toppingsGroupId = newId('toppings');
  const priceMatrix: OptionPriceCell[] = [];

  const sizeGroup: OptionGroup = {
    id: sizeGroupId,
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
    options: raw.sizes.map((s, i) => ({
      id: s.id,
      name: s.name,
      sourceLabel: s.name,
      price: Number(s.basePrice) || 0,
      maxQty: 1,
      isDefault: i === 0,
      sort: i,
      isAvailable: true,
    })),
  };

  const crustGroup: OptionGroup = {
    id: crustGroupId,
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
    options: (raw.crusts || []).map((c, i) => {
      for (const [sizeId, fee] of Object.entries(c.fees || {})) {
        if (fee != null) priceMatrix.push({ optionId: c.id, contextOptionId: sizeId, price: fee });
      }
      // Condition: available only on sizes where fee is not null — encoded as option.condition with op in
      const allowed = Object.entries(c.fees || {}).filter(([, fee]) => fee != null).map(([id]) => id);
      return {
        id: c.id,
        name: c.name,
        sourceLabel: c.name,
        price: 0,
        maxQty: 1,
        isDefault: i === 0,
        sort: i,
        isAvailable: true,
        condition: allowed.length ? { groupId: sizeGroupId, op: 'in' as const, optionIds: allowed } : null,
      };
    }),
  };

  const sauceGroup: OptionGroup = {
    id: sauceGroupId,
    name: 'Sauce',
    sourceLabel: 'Sauce',
    sourceStep: 3,
    min: 1,
    max: 1,
    freeCount: 0,
    pricingMode: 'included',
    portionLevels: null,
    placementEnabled: false,
    defaultRefund: 'nothing',
    options: (raw.sauces || []).map((s, i) => ({
      id: s.id,
      name: s.name,
      sourceLabel: s.name,
      price: 0,
      maxQty: 1,
      isDefault: i === 0,
      sort: i,
      isAvailable: true,
    })),
  };

  const cheeseGroup: OptionGroup = {
    id: cheeseGroupId,
    name: 'Cheese',
    sourceLabel: 'Cheese',
    sourceStep: 4,
    min: 1,
    max: 1,
    freeCount: 0,
    pricingMode: 'add',
    portionLevels: DEFAULT_PORTION_LEVELS.filter((p) => p.id === 'normal' || p.id === 'extra'),
    placementEnabled: false,
    defaultRefund: 'price',
    options: [
      {
        id: `${cheeseGroupId}-normal`,
        name: 'Normal',
        sourceLabel: 'Normal',
        price: 0,
        maxQty: 1,
        isDefault: true,
        sort: 0,
        isAvailable: true,
      },
      {
        id: `${cheeseGroupId}-extra`,
        name: 'Extra',
        sourceLabel: 'Extra',
        price: 0,
        maxQty: 1,
        isDefault: false,
        sort: 1,
        isAvailable: true,
      },
    ],
  };
  for (const [sizeId, fee] of Object.entries(raw.extraCheese || {})) {
    priceMatrix.push({ optionId: `${cheeseGroupId}-extra`, contextOptionId: sizeId, price: Number(fee) || 0 });
  }

  const toppings = [...(raw.meats || []), ...(raw.nonMeats || [])];
  const toppingsGroup: OptionGroup = {
    id: toppingsGroupId,
    name: 'Toppings',
    sourceLabel: 'Toppings',
    sourceStep: 5,
    min: 0,
    max: 0,
    freeCount: 0,
    pricingMode: 'add',
    portionLevels: [
      { id: 'normal', label: 'Normal', multiplier: 1 },
      { id: 'extra', label: 'Extra', multiplier: 2 },
    ],
    placementEnabled: false,
    defaultRefund: 'price',
    options: toppings.map((t, i) => {
      for (const [sizeId, price] of Object.entries(t.prices || {})) {
        priceMatrix.push({ optionId: t.id, contextOptionId: sizeId, price: Number(price) || 0 });
      }
      return {
        id: t.id,
        name: t.name,
        sourceLabel: t.name,
        price: 0,
        maxQty: 1,
        isDefault: false,
        sort: i,
        isAvailable: true,
      };
    }),
  };

  return {
    groups: [sizeGroup, crustGroup, sauceGroup, cheeseGroup, toppingsGroup],
    priceMatrix,
    sizeGroupId,
    crustGroupId,
    sauceGroupId,
    cheeseGroupId,
    toppingsGroupId,
    pizzaConfig: {
      halfPriceRule: 'full',
      maxToppings: null,
      specialtyMode: 'build',
    },
  };
}

type LegacyRecipe = {
  cheese?: 'normal' | 'extra';
  sauceId?: string;
  crustId?: string;
  toppings?: Array<{ id: string; portion?: 'normal' | 'extra' }>;
};

export function recipeToDefaultSelections(
  recipe: LegacyRecipe,
  converted: ConvertedPizza,
): OrderSelection[] {
  const cheeseOpt = recipe.cheese === 'extra'
    ? `${converted.cheeseGroupId}-extra`
    : `${converted.cheeseGroupId}-normal`;
  return [
    { groupId: converted.crustGroupId, optionId: text(recipe.crustId) },
    { groupId: converted.sauceGroupId, optionId: text(recipe.sauceId) },
    { groupId: converted.cheeseGroupId, optionId: cheeseOpt },
    ...(recipe.toppings || []).map((t) => ({
      groupId: converted.toppingsGroupId,
      optionId: t.id,
      portion: (t.portion || 'normal') as 'normal' | 'extra',
    })),
  ].filter((s) => s.optionId);
}

export function markDefaultToppings(group: OptionGroup, toppingIds: string[]): OptionGroup {
  const set = new Set(toppingIds);
  return {
    ...group,
    options: group.options.map((o) => ({ ...o, isDefault: set.has(o.id) })),
    defaultRefund: 'price',
  };
}

type LegacyItem = {
  id: string;
  category_id?: string;
  name: string;
  description?: string;
  image_url?: string;
  in_store_price?: number;
  price?: number;
  options?: unknown;
  pizza_recipe?: unknown;
  /** Real DB column */
  prep_time_mins?: number;
  /** Real DB column */
  source_price_checked_at?: string | null;
  /** @deprecated wrong names kept for old fixtures */
  prep_time_minutes?: number;
  price_checked_at?: string | null;
};

function legacyPrep(item: LegacyItem): number | undefined {
  const n = item.prep_time_mins ?? item.prep_time_minutes;
  return n != null && Number.isFinite(Number(n)) ? Number(n) : undefined;
}

function legacyCheckedAt(item: LegacyItem): string | null | undefined {
  return item.source_price_checked_at ?? item.price_checked_at;
}

type LegacyCategory = {
  id: string;
  name: string;
  section_kind?: string;
  sort_order?: number;
  pizza_menu?: unknown;
};

/**
 * Build a draft MenuSnapshot from one merchant's legacy categories + items.
 * Pizza sections share one converted pizza_menu per category.
 */
export function convertMerchantMenu(input: {
  menuId: string;
  version?: number;
  categories: LegacyCategory[];
  items: LegacyItem[];
}): MenuSnapshot {
  const version = input.version ?? 1;
  const groups: OptionGroup[] = [];
  const priceMatrix: OptionPriceCell[] = [];
  const products: MenuProduct[] = [];
  const sections: MenuSection[] = [];
  const pizzaByCategory = new Map<string, ConvertedPizza>();

  for (const cat of input.categories) {
    const kind = cat.section_kind === 'pizza' || cat.section_kind === 'sized' ? cat.section_kind : 'standard';
    sections.push({
      id: cat.id,
      name: cat.name,
      sectionType: kind,
      sort: Number(cat.sort_order) || 0,
    });
    if (kind === 'pizza' && cat.pizza_menu) {
      const converted = convertLegacyPizzaMenu(cat.pizza_menu as LegacyPizzaMenu);
      if (converted) {
        pizzaByCategory.set(cat.id, converted);
        groups.push(...converted.groups);
        priceMatrix.push(...converted.priceMatrix);
      }
    }
  }

  for (const item of input.items) {
    const catId = text(item.category_id);
    const pizza = pizzaByCategory.get(catId);
    const recipe = item.pizza_recipe && typeof item.pizza_recipe === 'object'
      ? item.pizza_recipe as LegacyRecipe
      : null;

    if (pizza && recipe) {
      const toppingIds = (recipe.toppings || []).map((t) => t.id);
      const toppingsGroup = markDefaultToppings(
        pizza.groups.find((g) => g.id === pizza.toppingsGroupId)!,
        toppingIds,
      );
      // Per-product we still share groups; defaults live on product via isDefault on shared toppings
      // For migration parity, stamp defaults onto a product-scoped copy of toppings group
      const productToppingsId = `${item.id}-toppings`;
      const productToppings: OptionGroup = {
        ...toppingsGroup,
        id: productToppingsId,
        options: toppingsGroup.options.map((o) => ({ ...o, isDefault: toppingIds.includes(o.id) })),
        defaultRefund: 'price',
      };
      groups.push(productToppings);
      for (const cell of pizza.priceMatrix.filter((c) => toppingIds.includes(c.optionId) || pizza.groups.some((g) => g.options.some((o) => o.id === c.optionId)))) {
        if (toppingIds.includes(cell.optionId) || productToppings.options.some((o) => o.id === cell.optionId)) {
          priceMatrix.push(cell);
        }
      }

      products.push({
        id: item.id,
        sectionId: catId,
        type: 'pizza',
        name: item.name,
        description: item.description,
        imageUrl: item.image_url,
        basePrice: 0,
        prepMinutes: legacyPrep(item),
        priceCheckedAt: legacyCheckedAt(item),
        groupLinks: [
          { groupId: pizza.sizeGroupId, sort: 1 },
          { groupId: pizza.crustGroupId, sort: 2 },
          { groupId: pizza.sauceGroupId, sort: 3 },
          { groupId: pizza.cheeseGroupId, sort: 4 },
          { groupId: productToppingsId, sort: 5 },
        ],
        pizza: { ...pizza.pizzaConfig, specialtyMode: 'build' },
      });
      continue;
    }

    const converted = convertLegacyOptions(item.options, input.menuId);
    groups.push(...converted.groups);
    products.push({
      id: item.id,
      sectionId: catId,
      type: 'standard',
      name: item.name,
      description: item.description,
      imageUrl: item.image_url,
      basePrice: Number(item.in_store_price ?? item.price) || 0,
      prepMinutes: legacyPrep(item),
      priceCheckedAt: legacyCheckedAt(item),
      groupLinks: converted.groupIds.map((groupId, i) => ({ groupId, sort: i + 1 })),
    });
  }

  return {
    menuId: input.menuId,
    version,
    groups,
    priceMatrix,
    products,
    sections,
  };
}
