/** @roam/menu-engine — one option engine for every product type. */

export const ENGINE_EXPORTS = [
  'ENGINE_API_VERSION',
  'priceLine',
  'buildBuyerTicket',
  'convertLegacyOptions',
  'convertLegacyPizzaMenu',
  'convertMerchantMenu',
  'kitsForCuisines',
  'BUILTIN_KITS',
  'pricingModeFromLegacyKind',
  'selectionMatches',
  'flattenSelections',
  'parseMenuSnapshot',
  'snapshotJson',
  'applyLocationOverrides',
] as const;

export { ENGINE_API_VERSION } from './types.ts';
export type * from './types.ts';

export { priceLine } from './priceLine.ts';
export { buildBuyerTicket } from './ticket.ts';
export { selectionMatches, flattenSelections } from './conditions.ts';
export {
  DEFAULT_PORTION_LEVELS,
  CHEESE_PORTION_LEVELS,
  pricingModeFromLegacyKind,
  emptyGroup,
  wingsConfig,
} from './presets.ts';
export {
  convertLegacyOptions,
  convertLegacyPizzaMenu,
  convertMerchantMenu,
  recipeToDefaultSelections,
  markDefaultToppings,
} from './convertLegacy.ts';
export type { ConvertedPizza } from './convertLegacy.ts';
export { BUILTIN_KITS, kitsForCuisines } from './kits.ts';
export type { MenuKitDef, MenuKitPayload } from './kits.ts';
export { parseMenuSnapshot, snapshotJson } from './snapshot.ts';
export { applyLocationOverrides } from './locationOverrides.ts';
export type { LocationOverride } from './locationOverrides.ts';
