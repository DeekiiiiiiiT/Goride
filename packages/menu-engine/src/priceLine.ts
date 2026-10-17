import { flattenSelections, selectionMatches } from './conditions.ts';
import { buildBuyerTicket } from './ticket.ts';
import type {
  MarkupFn,
  MenuOption,
  MenuProduct,
  MenuSnapshot,
  OptionGroup,
  OrderLine,
  OrderSelection,
  Placement,
  PortionLevel,
  PriceLineResult,
} from './types.ts';

function groupsById(snapshot: MenuSnapshot): Map<string, OptionGroup> {
  return new Map(snapshot.groups.map((g) => [g.id, g]));
}

function findOption(group: OptionGroup, optionId: string): MenuOption | undefined {
  return group.options.find((o) => o.id === optionId);
}

function matrixOr(snapshot: MenuSnapshot, optionId: string, contextId: string | null, fallback: number): number {
  if (!contextId) return fallback;
  const cell = snapshot.priceMatrix.find((r) => r.optionId === optionId && r.contextOptionId === contextId);
  return cell ? cell.price : fallback;
}

function portionMult(group: OptionGroup, portion: PortionLevel | undefined): number {
  if (!group.portionLevels?.length) {
    if (portion === 'extra' || portion === 'double') return 2;
    return 1;
  }
  const level = portion || 'normal';
  return group.portionLevels.find((p) => p.id === level)?.multiplier ?? 1;
}

function placeFactor(placement: Placement | undefined, halfRule: 'full' | 'half' | undefined): number {
  if (!placement || placement === 'whole') return 1;
  return halfRule === 'half' ? 0.5 : 1;
}

function sizeContext(product: MenuProduct, groups: Map<string, OptionGroup>, selections: OrderSelection[]): string | null {
  for (const link of [...product.groupLinks].sort((a, b) => a.sort - b.sort)) {
    const group = groups.get(link.groupId);
    if (!group || group.pricingMode !== 'replace') continue;
    const pick = selections.find((s) => s.groupId === group.id);
    if (pick) return pick.optionId;
  }
  return null;
}

function validateGroup(group: OptionGroup, picks: OrderSelection[], all: OrderSelection[]): string | null {
  if (!selectionMatches(group.condition, all)) return null;
  for (const pick of picks) {
    const opt = findOption(group, pick.optionId);
    if (!opt) return `Unknown choice in ${group.sourceLabel || group.name}`;
    if (!opt.isAvailable) return `${opt.sourceLabel || opt.name} is sold out`;
    if (!selectionMatches(opt.condition, all)) {
      return `${opt.sourceLabel || opt.name} is not available with your other choices`;
    }
    const qty = Math.max(1, Math.round(pick.qty || 1));
    if (qty > Math.max(1, opt.maxQty || 1)) {
      return `You can only add ${opt.maxQty} of ${opt.sourceLabel || opt.name}`;
    }
  }
  const count = picks.reduce((n, p) => n + Math.max(1, Math.round(p.qty || 1)), 0);
  if (count < group.min) return `Choose at least ${group.min} for ${group.sourceLabel || group.name}`;
  if (group.max > 0 && count > group.max) return `You can only add ${group.max} for ${group.sourceLabel || group.name}`;
  return null;
}

function unitAdd(
  snapshot: MenuSnapshot,
  group: OptionGroup,
  pick: OrderSelection,
  ctx: string | null,
  halfRule: 'full' | 'half' | undefined,
): number {
  const opt = findOption(group, pick.optionId);
  if (!opt) return 0;
  let unit = matrixOr(snapshot, opt.id, ctx, opt.price);
  unit *= portionMult(group, pick.portion);
  unit *= placeFactor(pick.placement, halfRule);
  return unit * Math.max(1, Math.round(pick.qty || 1));
}

function priceBuildMode(
  snapshot: MenuSnapshot,
  product: MenuProduct,
  selections: OrderSelection[],
  groups: Map<string, OptionGroup>,
): { ok: true; restaurant: number } | { ok: false; error: string } {
  const flat = flattenSelections(selections);
  const ctx = sizeContext(product, groups, flat);
  const halfRule = product.pizza?.halfPriceRule;
  let restaurant = Math.max(0, Number(product.basePrice) || 0);

  for (const link of [...product.groupLinks].sort((a, b) => a.sort - b.sort)) {
    const group = groups.get(link.groupId);
    if (!group || !selectionMatches(group.condition, flat)) continue;
    const picks = selections.filter((s) => s.groupId === group.id);
    const err = validateGroup(group, picks, flat);
    if (err) return { ok: false, error: err };

    if (product.pizza?.maxToppings != null && group.placementEnabled) {
      const n = picks.reduce((c, p) => c + Math.max(1, Math.round(p.qty || 1)), 0);
      if (n > product.pizza.maxToppings) return { ok: false, error: `Maximum ${product.pizza.maxToppings} toppings` };
    }

    if (group.pricingMode === 'replace') {
      if (picks.length !== 1) return { ok: false, error: `Choose ${group.sourceLabel || group.name}` };
      const opt = findOption(group, picks[0].optionId)!;
      restaurant = opt.price;
      continue;
    }
    if (group.pricingMode === 'included') continue;

    const defaults = new Set(group.options.filter((o) => o.isDefault).map((o) => o.id));
    let addTotal = 0;
    const chargeable: OrderSelection[] = [];
    for (const pick of picks) {
      if (defaults.has(pick.optionId) && group.defaultRefund === 'nothing') {
        const mult = portionMult(group, pick.portion);
        if (mult > 1) {
          const opt = findOption(group, pick.optionId)!;
          addTotal += matrixOr(snapshot, opt.id, ctx, opt.price) * (mult - 1)
            * placeFactor(pick.placement, halfRule)
            * Math.max(1, Math.round(pick.qty || 1));
        }
        continue;
      }
      chargeable.push(pick);
      addTotal += unitAdd(snapshot, group, pick, ctx, halfRule);
    }
    if (group.freeCount > 0) {
      const sorted = [...chargeable];
      let waived = 0;
      for (const pick of sorted.slice(0, group.freeCount)) {
        waived += unitAdd(snapshot, group, pick, ctx, halfRule);
      }
      addTotal = Math.max(0, addTotal - waived);
    }
    restaurant += addTotal;
  }

  // Nested groups on selected options (drink → size)
  for (const sel of selections) {
    const group = groups.get(sel.groupId);
    const opt = group ? findOption(group, sel.optionId) : undefined;
    if (!opt?.nestedGroupId || !sel.children?.length) continue;
    const nested = groups.get(opt.nestedGroupId);
    if (!nested) continue;
    const err = validateGroup(nested, sel.children, flat);
    if (err) return { ok: false, error: err };
    for (const child of sel.children) {
      if (nested.pricingMode === 'replace' || nested.pricingMode === 'add') {
        const childOpt = findOption(nested, child.optionId);
        if (childOpt) restaurant += childOpt.price * Math.max(1, Math.round(child.qty || 1));
      }
    }
  }

  return { ok: true, restaurant: Math.round(restaurant) };
}

function priceFixedSpecialty(
  snapshot: MenuSnapshot,
  product: MenuProduct,
  selections: OrderSelection[],
  groups: Map<string, OptionGroup>,
): { ok: true; restaurant: number } | { ok: false; error: string } {
  const flat = flattenSelections(selections);
  const ctx = sizeContext(product, groups, flat);
  if (!ctx || !product.pizza?.fixedPricesBySize) return { ok: false, error: 'Choose a size' };
  const fixed = product.pizza.fixedPricesBySize[ctx];
  if (fixed == null || !(fixed > 0)) return { ok: false, error: 'That size is not available' };

  const halfRule = product.pizza.halfPriceRule;
  let restaurant = fixed;

  for (const link of [...product.groupLinks].sort((a, b) => a.sort - b.sort)) {
    const group = groups.get(link.groupId);
    if (!group || !selectionMatches(group.condition, flat)) continue;
    const picks = selections.filter((s) => s.groupId === group.id);
    const err = validateGroup(group, picks, flat);
    if (err) return { ok: false, error: err };

    if (group.pricingMode === 'replace') continue; // size already in fixed
    if (group.pricingMode === 'included') continue;

    const defaults = new Set(group.options.filter((o) => o.isDefault).map((o) => o.id));
    for (const pick of picks) {
      if (defaults.has(pick.optionId)) {
        const mult = portionMult(group, pick.portion);
        if (mult > 1) {
          const opt = findOption(group, pick.optionId)!;
          restaurant += matrixOr(snapshot, opt.id, ctx, opt.price) * (mult - 1)
            * placeFactor(pick.placement, halfRule);
        }
        continue;
      }
      // Paid crust / sauce / added toppings
      restaurant += unitAdd(snapshot, group, pick, ctx, halfRule);
    }
  }
  return { ok: true, restaurant: Math.round(restaurant) };
}

function wingsError(product: MenuProduct, selections: OrderSelection[], groups: Map<string, OptionGroup>): string | null {
  const cfg = product.wings;
  if (!cfg) return null;
  const piecesGroup = groups.get(cfg.piecesGroupId);
  const flavourGroup = groups.get(cfg.flavourGroupId);
  if (!piecesGroup || !flavourGroup) return null;
  const piecePick = selections.find((s) => s.groupId === cfg.piecesGroupId);
  if (!piecePick) return `Choose ${piecesGroup.sourceLabel || piecesGroup.name}`;
  const pieceOpt = findOption(piecesGroup, piecePick.optionId);
  const pieces = Number(String(pieceOpt?.name || '').match(/\d+/)?.[0] || 0);
  const required = cfg.flavourPerPieces > 0 ? Math.max(1, Math.ceil(pieces / cfg.flavourPerPieces)) : flavourGroup.min;
  const flavours = selections.filter((s) => s.groupId === cfg.flavourGroupId);
  if (flavours.length < required) {
    return `Pick ${required} flavour${required === 1 ? '' : 's'} for ${pieces}-piece wings`;
  }
  return null;
}

function priceCombo(
  snapshot: MenuSnapshot,
  product: MenuProduct,
  line: OrderLine,
  markup: MarkupFn,
): PriceLineResult {
  let restaurant = Math.max(0, Number(product.basePrice) || 0);
  const groups = groupsById(snapshot);
  const nestedTickets = [];

  for (const slot of product.comboSlots || []) {
    const filled = (line.slots || []).find((s) => s.slotId === slot.id);
    if (!filled) return { ok: false, error: `Choose ${slot.sourceLabel || slot.name}` };
    if (!slot.allowedProductIds.includes(filled.line.productId)) {
      return { ok: false, error: `That item is not allowed in ${slot.name}` };
    }
    const nested = priceLine(snapshot, { ...filled.line, quantity: 1, menuVersion: line.menuVersion }, markup);
    if (!nested.ok) return nested;
    for (const up of slot.upcharges) {
      if (selectionMatches(up.when, flattenSelections(filled.line.selections))) restaurant += up.amount;
    }
    nestedTickets.push(nested.ticket);
  }

  const qty = Math.max(1, Math.round(line.quantity || 1));
  const ticket = buildBuyerTicket(snapshot, product, line, groups);
  let stepBase = ticket.steps.length;
  for (const t of nestedTickets) {
    for (const step of t.steps) {
      ticket.steps.push({
        ...step,
        step: ++stepBase,
        label: `${t.title}: ${step.label}`,
        copyText: `${t.title}: ${step.copyText}`,
      });
    }
  }
  ticket.copyAll = [`${ticket.title}${qty > 1 ? ` (×${qty})` : ''}`, ...ticket.steps.map((s) => `${s.step}. ${s.copyText}`)].join('\n');
  return {
    ok: true,
    restaurant: restaurant * qty,
    customer: markup(restaurant) * qty,
    ticket: { ...ticket, quantity: qty },
  };
}

/** Validate and price one order line from a published snapshot. IDs only. */
export function priceLine(
  snapshot: MenuSnapshot,
  line: OrderLine,
  markup: MarkupFn = (r) => r,
): PriceLineResult {
  if (line.menuVersion !== snapshot.version) {
    return { ok: false, error: 'This menu has been updated — refresh and try again' };
  }
  const product = snapshot.products.find((p) => p.id === line.productId && !p.archivedAt);
  if (!product) return { ok: false, error: 'That item is not on the menu' };

  const groups = groupsById(snapshot);

  if (product.type === 'combo' && (product.comboSlots?.length || 0) > 0) {
    return priceCombo(snapshot, product, line, markup);
  }

  const wErr = wingsError(product, line.selections, groups);
  if (wErr) return { ok: false, error: wErr };

  const priced = product.pizza?.specialtyMode === 'fixed' && product.pizza.fixedPricesBySize
    ? priceFixedSpecialty(snapshot, product, line.selections, groups)
    : priceBuildMode(snapshot, product, line.selections, groups);

  if (!priced.ok) return priced;

  const qty = Math.max(1, Math.round(line.quantity || 1));
  const ticket = buildBuyerTicket(snapshot, product, line, groups);
  return {
    ok: true,
    restaurant: priced.restaurant * qty,
    customer: markup(priced.restaurant) * qty,
    ticket: { ...ticket, quantity: qty },
  };
}
