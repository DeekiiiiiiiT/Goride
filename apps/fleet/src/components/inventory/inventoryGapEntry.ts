import type { InventoryGapContext, InventoryModalId, InventoryShellState } from './InventoryShellContext';

export function openInventoryGap(
  shell: InventoryShellState,
  modal: InventoryModalId,
  ctx?: InventoryGapContext,
) {
  shell.openGap(modal, ctx);
}

export const inventoryGapEntryPoints = {
  settings: 'inventory-settings',
  openingBalances: 'opening-balances',
  itemEditor: 'item-editor',
  importItems: 'import-items',
  locationsBins: 'locations-bins',
  registerAsset: 'register-asset',
  snoozeSettings: 'snooze-settings',
  kitCompare: 'kit-compare',
  driverReportUpdate: 'driver-report-update',
} as const satisfies Record<string, InventoryModalId>;
