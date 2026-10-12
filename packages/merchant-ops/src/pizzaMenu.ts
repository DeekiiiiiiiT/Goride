/** A pizza price is the size, plus a crust fee, extra cheese, and toppings. Sauce is free. */

export type PizzaPortion = 'normal' | 'extra';

export type PizzaSize = {
  id: string;
  name: string;
  basePrice: number;
};

export type PizzaCrust = {
  id: string;
  name: string;
  description: string;
  /** Missing or null means this crust is not sold on that size. 0 is free. */
  fees: Record<string, number | null>;
};

export type PizzaTopping = {
  id: string;
  name: string;
  prices: Record<string, number>;
};

export type PizzaSauce = {
  id: string;
  name: string;
};

export type PizzaMenu = {
  sizes: PizzaSize[];
  crusts: PizzaCrust[];
  extraCheese: Record<string, number>;
  sauces: PizzaSauce[];
  meats: PizzaTopping[];
  nonMeats: PizzaTopping[];
};

export type PizzaToppingPick = {
  id: string;
  portion: PizzaPortion;
};

/** How this pizza starts before the customer changes it. */
export type PizzaRecipe = {
  cheese: PizzaPortion;
  sauceId: string;
  crustId: string;
  toppings: PizzaToppingPick[];
};

/** What the customer actually ordered. */
export type PizzaPick = {
  sizeId: string;
  crustId: string;
  cheese: PizzaPortion;
  sauceId: string;
  toppings: PizzaToppingPick[];
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function money(value: unknown): number | null {
  if (value == null || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

function portion(value: unknown): PizzaPortion | null {
  return value === 'normal' || value === 'extra' ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function parsePizzaMenu(raw: unknown): PizzaMenu | null {
  const row = record(raw);
  if (!Array.isArray(row.sizes) || !Array.isArray(row.crusts)) return null;
  const sizes = row.sizes.map((entry) => {
    const size = record(entry);
    const basePrice = money(size.basePrice);
    const id = text(size.id);
    if (!id || !text(size.name) || basePrice == null || basePrice <= 0) return null;
    return { id, name: text(size.name), basePrice };
  });
  if (sizes.some((size) => !size)) return null;
  const crusts = row.crusts.map((entry) => {
    const crust = record(entry);
    const id = text(crust.id);
    if (!id || !text(crust.name)) return null;
    const fees: Record<string, number | null> = {};
    const rawFees = record(crust.fees);
    for (const [sizeId, fee] of Object.entries(rawFees)) {
      fees[sizeId] = fee == null ? null : money(fee);
    }
    return { id, name: text(crust.name), description: text(crust.description), fees };
  });
  if (crusts.some((crust) => !crust)) return null;
  const extraCheese: Record<string, number> = {};
  for (const [sizeId, fee] of Object.entries(record(row.extraCheese))) {
    const amount = money(fee);
    if (amount == null) return null;
    extraCheese[sizeId] = amount;
  }
  const sauces = Array.isArray(row.sauces) ? row.sauces.map((entry) => {
    const sauce = record(entry);
    const id = text(sauce.id);
    if (!id || !text(sauce.name)) return null;
    return { id, name: text(sauce.name) };
  }) : [];
  if (sauces.some((sauce) => !sauce)) return null;
  const toppings = (kind: 'meats' | 'nonMeats') => {
    const list = Array.isArray(row[kind]) ? row[kind] : [];
    return list.map((entry) => {
      const topping = record(entry);
      const id = text(topping.id);
      if (!id || !text(topping.name)) return null;
      const prices: Record<string, number> = {};
      for (const [sizeId, price] of Object.entries(record(topping.prices))) {
        const amount = money(price);
        if (amount == null) return null;
        prices[sizeId] = amount;
      }
      return { id, name: text(topping.name), prices };
    });
  };
  const meats = toppings('meats');
  const nonMeats = toppings('nonMeats');
  if (meats.some((topping) => !topping) || nonMeats.some((topping) => !topping)) return null;
  return {
    sizes: sizes as PizzaSize[],
    crusts: crusts as PizzaCrust[],
    extraCheese,
    sauces: sauces as PizzaSauce[],
    meats: meats as PizzaTopping[],
    nonMeats: nonMeats as PizzaTopping[],
  };
}

export function parsePizzaRecipe(raw: unknown): PizzaRecipe | null {
  const row = record(raw);
  const cheese = portion(row.cheese);
  const sauceId = text(row.sauceId);
  const crustId = text(row.crustId);
  if (!cheese || !sauceId || !crustId || !Array.isArray(row.toppings)) return null;
  const toppings: PizzaToppingPick[] = [];
  for (const entry of row.toppings) {
    const topping = record(entry);
    const picked = portion(topping.portion);
    const id = text(topping.id);
    if (!id || !picked) return null;
    toppings.push({ id, portion: picked });
  }
  return { cheese, sauceId, crustId, toppings };
}

export function parsePizzaPick(raw: unknown): PizzaPick | null {
  const row = record(raw);
  const sizeId = text(row.sizeId);
  const recipe = parsePizzaRecipe(row);
  if (!sizeId || !recipe) return null;
  return { sizeId, ...recipe };
}

function toppingCatalog(menu: PizzaMenu): Map<string, PizzaTopping> {
  return new Map([...menu.meats, ...menu.nonMeats].map((topping) => [topping.id, topping]));
}

export function crustFee(menu: PizzaMenu, crustId: string, sizeId: string): number | null {
  const crust = menu.crusts.find((entry) => entry.id === crustId);
  if (!crust || !(sizeId in crust.fees)) return null;
  const fee = crust.fees[sizeId];
  return fee == null ? null : fee;
}

export function validatePizzaMenu(menu: PizzaMenu): string | null {
  if (!menu.sizes.length) return 'Add at least one pizza size';
  const sizeIds = new Set<string>();
  for (const size of menu.sizes) {
    if (!size.name.trim()) return 'Every size needs a name';
    if (!(size.basePrice > 0)) return `Enter the price for ${size.name}`;
    if (sizeIds.has(size.id)) return 'Each size can only be listed once';
    sizeIds.add(size.id);
  }
  if (!menu.crusts.length) return 'Add at least one crust';
  for (const crust of menu.crusts) {
    if (!crust.name.trim()) return 'Every crust needs a name';
  }
  for (const size of menu.sizes) {
    const offered = menu.crusts.some((crust) => crustFee(menu, crust.id, size.id) != null);
    if (!offered) return `${size.name} needs at least one crust`;
    if (!(size.id in menu.extraCheese) || menu.extraCheese[size.id] < 0) {
      return `Enter the extra cheese price for ${size.name}`;
    }
  }
  if (!menu.sauces.length || menu.sauces.some((sauce) => !sauce.name.trim())) {
    return 'Add a sauce';
  }
  const seen = new Set<string>();
  for (const topping of [...menu.meats, ...menu.nonMeats]) {
    if (!topping.name.trim()) return 'Every topping needs a name';
    if (seen.has(topping.id)) return 'Each topping can only be listed once';
    seen.add(topping.id);
    for (const size of menu.sizes) {
      if (!(size.id in topping.prices) || topping.prices[size.id] < 0) {
        return `Enter the ${size.name} price for ${topping.name}`;
      }
    }
  }
  return null;
}

export function pizzaRestaurantPrice(menu: PizzaMenu, pick: PizzaPick): { ok: true; restaurant: number } | { ok: false; error: string } {
  const invalid = validatePizzaMenu(menu);
  if (invalid) return { ok: false, error: invalid };
  const size = menu.sizes.find((entry) => entry.id === pick.sizeId);
  if (!size) return { ok: false, error: 'Choose a size' };
  const fee = crustFee(menu, pick.crustId, size.id);
  if (fee == null) return { ok: false, error: 'That crust is not sold on this size' };
  if (!menu.sauces.some((sauce) => sauce.id === pick.sauceId)) return { ok: false, error: 'Choose a sauce' };
  if (pick.cheese !== 'normal' && pick.cheese !== 'extra') return { ok: false, error: 'Choose the cheese amount' };
  let restaurant = size.basePrice + fee;
  if (pick.cheese === 'extra') restaurant += menu.extraCheese[size.id];
  const catalog = toppingCatalog(menu);
  const seen = new Set<string>();
  for (const picked of pick.toppings) {
    if (seen.has(picked.id)) return { ok: false, error: 'That topping was added twice' };
    seen.add(picked.id);
    const topping = catalog.get(picked.id);
    if (!topping || !(size.id in topping.prices)) return { ok: false, error: 'That topping is not on this menu' };
    restaurant += topping.prices[size.id] * (picked.portion === 'extra' ? 2 : 1);
  }
  return { ok: true, restaurant };
}

export function defaultPizzaRecipe(menu: PizzaMenu): PizzaRecipe {
  const free = menu.crusts.find((crust) => menu.sizes.some((size) => crust.fees[size.id] === 0));
  return {
    cheese: 'normal',
    sauceId: menu.sauces[0]?.id || '',
    crustId: free?.id || menu.crusts[0]?.id || '',
    toppings: [],
  };
}

/** Lowest size that can use this recipe's crust. The menu card shows this price. */
export function cheapestPizzaPrice(menu: PizzaMenu, recipe: PizzaRecipe): number | null {
  const amounts: number[] = [];
  for (const size of menu.sizes) {
    const priced = pizzaRestaurantPrice(menu, { ...recipe, sizeId: size.id });
    if (priced.ok) amounts.push(priced.restaurant);
  }
  if (!amounts.length) return null;
  return Math.min(...amounts);
}
