import type { MenuProduct, MenuSnapshot, OptionGroup, OptionPriceCell, ProductType } from '@roam/menu-engine';

/** A dish template: one product plus the choice groups it links to. */
export type TemplatePayload = {
  product: MenuProduct;
  groups: OptionGroup[];
  priceMatrix: OptionPriceCell[];
};

const TEMPLATE_SECTION_ID = 'template-section';

export function blankTemplatePayload(type: ProductType): TemplatePayload {
  const product: MenuProduct = {
    id: crypto.randomUUID(),
    sectionId: TEMPLATE_SECTION_ID,
    type,
    name: '',
    basePrice: 0,
    groupLinks: [],
    ...(type === 'pizza' ? { pizza: { halfPriceRule: 'full', maxToppings: 10, specialtyMode: 'build' } } : {}),
    ...(type === 'wings' ? { wings: { flavourPerPieces: 6, flavourGroupId: '', piecesGroupId: '' } } : {}),
    ...(type === 'combo' ? { comboSlots: [] } : {}),
  };
  return { product, groups: [], priceMatrix: [] };
}

/** A one-dish snapshot so the normal product editors can edit a template. */
export function templateToSnapshot(payload: TemplatePayload): MenuSnapshot {
  return {
    menuId: 'template',
    version: 0,
    groups: payload.groups,
    priceMatrix: payload.priceMatrix,
    products: [{ ...payload.product, sectionId: TEMPLATE_SECTION_ID }],
    sections: [{ id: TEMPLATE_SECTION_ID, name: 'Template', sectionType: payload.product.type, sort: 0 }],
  };
}

/** Keep only the groups (and nested groups) the dish actually uses. */
export function snapshotToTemplate(snapshot: MenuSnapshot): TemplatePayload {
  const product = snapshot.products[0];
  if (!product) throw new Error('Template has no dish');
  const byId = new Map(snapshot.groups.map((g) => [g.id, g]));
  const keep = new Set<string>();
  const visit = (id: string | null | undefined) => {
    if (!id || keep.has(id) || !byId.has(id)) return;
    keep.add(id);
    for (const option of byId.get(id)!.options) visit(option.nestedGroupId);
  };
  product.groupLinks.forEach((link) => visit(link.groupId));
  visit(product.wings?.flavourGroupId);
  visit(product.wings?.piecesGroupId);
  const groups = snapshot.groups.filter((g) => keep.has(g.id));
  const optionIds = new Set(groups.flatMap((g) => g.options.map((o) => o.id)));
  const priceMatrix = snapshot.priceMatrix.filter((cell) => optionIds.has(cell.optionId));
  return {
    product: { ...product, archivedAt: null, priceCheckedAt: null },
    groups,
    priceMatrix,
  };
}

/**
 * Copy a template into a menu with fresh ids, so two dishes made from one
 * template never share a choice group and later template edits never touch them.
 */
export function instantiateTemplate(
  payload: TemplatePayload,
  sectionId: string,
  name?: string,
): TemplatePayload {
  const ids = new Map<string, string>();
  const fresh = (id: string) => {
    if (!ids.has(id)) ids.set(id, crypto.randomUUID());
    return ids.get(id)!;
  };
  fresh(payload.product.id);
  for (const group of payload.groups) {
    fresh(group.id);
    for (const option of group.options) fresh(option.id);
  }
  // Ids are UUIDs, so replacing quoted ids in JSON rewrites every reference
  // (links, nested groups, conditions, size prices, wings) without missing a field.
  let json = JSON.stringify(payload);
  for (const [from, to] of ids) json = json.split(`"${from}"`).join(`"${to}"`);
  const copy = JSON.parse(json) as TemplatePayload;
  // Pizza fixed prices are keyed by size option id (object keys, not values).
  if (copy.product.pizza?.fixedPricesBySize) {
    const remapped: Record<string, number> = {};
    for (const [key, price] of Object.entries(copy.product.pizza.fixedPricesBySize)) {
      remapped[ids.get(key) ?? key] = price;
    }
    copy.product.pizza = { ...copy.product.pizza, fixedPricesBySize: remapped };
  }
  return {
    ...copy,
    product: {
      ...copy.product,
      sectionId,
      name: name?.trim() || copy.product.name || 'New dish',
      archivedAt: null,
      priceCheckedAt: null,
      // Combo slots point at other dishes in a menu; a template can't know them.
      ...(copy.product.comboSlots
        ? { comboSlots: copy.product.comboSlots.map((slot) => ({ ...slot, allowedProductIds: [] })) }
        : {}),
    },
  };
}

/** Add an instantiated template to a menu snapshot. */
export function addTemplateToSnapshot(
  snapshot: MenuSnapshot,
  payload: TemplatePayload,
  sectionId: string,
  name?: string,
): { snapshot: MenuSnapshot; productId: string } {
  const copy = instantiateTemplate(payload, sectionId, name);
  return {
    productId: copy.product.id,
    snapshot: {
      ...snapshot,
      groups: [...snapshot.groups, ...copy.groups],
      priceMatrix: [...snapshot.priceMatrix, ...copy.priceMatrix],
      products: [...snapshot.products, copy.product],
    },
  };
}
