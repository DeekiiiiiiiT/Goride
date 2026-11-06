import type { InventoryModalId } from './InventoryShellContext';
import type { InventoryTabId } from './InventoryTabs';

export type InventoryPhaseFlags = {
  phase4Assets: boolean;
  phase6Purchasing: boolean;
  phase7Counts: boolean;
  phase8Telematics: boolean;
};

export const INVENTORY_PHASE_OFF_MESSAGE = "This part of Inventory isn't switched on yet";

const ALL_TABS: InventoryTabId[] = [
  'overview',
  'stock',
  'vehicle-kits',
  'assets',
  'movements',
  'purchasing',
  'counts',
  'alerts',
];

export function visibleInventoryTabs(flags: InventoryPhaseFlags): InventoryTabId[] {
  return ALL_TABS.filter((id) => {
    if (id === 'assets') return flags.phase4Assets;
    if (id === 'purchasing') return flags.phase6Purchasing;
    if (id === 'counts') return flags.phase7Counts;
    return true;
  });
}

export function isTabVisible(tab: InventoryTabId, flags: InventoryPhaseFlags): boolean {
  return visibleInventoryTabs(flags).includes(tab);
}

export function phaseFlagForModal(modal: InventoryModalId): keyof InventoryPhaseFlags | null {
  switch (modal) {
    case 'register-asset':
    case 'asset-page':
      return 'phase4Assets';
    case 'purchase-order':
    case 'vendor-editor':
    case 'requisition':
      return 'phase6Purchasing';
    case 'count-session':
    case 'scanner-pair':
      return 'phase7Counts';
    default:
      return null;
  }
}

export function isModalAllowed(modal: InventoryModalId, flags: InventoryPhaseFlags): boolean {
  const key = phaseFlagForModal(modal);
  if (!key) return true;
  return flags[key];
}
