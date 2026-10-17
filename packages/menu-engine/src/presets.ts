import type { OptionGroup, PortionLevelDef, WingsConfig } from './types.ts';

export const DEFAULT_PORTION_LEVELS: PortionLevelDef[] = [
  { id: 'none', label: 'None', multiplier: 0 },
  { id: 'light', label: 'Light', multiplier: 1 },
  { id: 'normal', label: 'Normal', multiplier: 1 },
  { id: 'extra', label: 'Extra', multiplier: 2 },
  { id: 'double', label: 'Double', multiplier: 2 },
];

export const CHEESE_PORTION_LEVELS: PortionLevelDef[] = [
  { id: 'none', label: 'None', multiplier: 0 },
  { id: 'light', label: 'Light', multiplier: 1 },
  { id: 'normal', label: 'Normal', multiplier: 1 },
  { id: 'extra', label: 'Extra', multiplier: 1, fee: 0 }, // fee filled per size via matrix on options
  { id: 'double', label: 'Double', multiplier: 1, fee: 0 },
];

/** Map legacy choice kind → engine pricing mode. */
export function pricingModeFromLegacyKind(kind: 'included' | 'priced' | 'extra') {
  if (kind === 'priced') return 'replace' as const;
  if (kind === 'included') return 'included' as const;
  return 'add' as const;
}

export function emptyGroup(partial: Partial<OptionGroup> & Pick<OptionGroup, 'id' | 'name'>): OptionGroup {
  return {
    min: 0,
    max: 0,
    freeCount: 0,
    pricingMode: 'add',
    portionLevels: null,
    placementEnabled: false,
    defaultRefund: 'price',
    options: [],
    ...partial,
  };
}

export function wingsConfig(piecesGroupId: string, flavourGroupId: string, flavourPerPieces = 6): WingsConfig {
  return { piecesGroupId, flavourGroupId, flavourPerPieces };
}
