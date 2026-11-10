import { useMemo } from 'react';
import {
  aggregateKitVehicles,
  asRecord,
  formatPlate,
  formatStockValue,
  numField,
  primaryWarehouseLabel,
  strField,
  storeNeedsFrom,
  sumStockValue,
  type KitVehicleSummary,
  type StoreNeed,
} from './inventoryData';
import type { InventoryShellState } from './InventoryShellContext';

export type InventoryLive = {
  hubName: string;
  hubShort: string;
  totalStockValue: string;
  totalStockValueRaw: number;
  inStoreValue: string;
  onCarsValue: string;
  openAlertCount: number;
  kitVehicles: KitVehicleSummary[];
  primaryPlate: string;
  secondaryPlate: string;
  primaryVehicle: KitVehicleSummary | null;
  secondaryVehicle: KitVehicleSummary | null;
  lowStockCount: number;
  lowStockLabel: string;
  /** Kit items the store can't cover (IV-02). */
  lowOrOut: StoreNeed[];
  storeNeeds: StoreNeed[];
  /** Sum of required kit lines missing or short across all cars. */
  missingRequiredTotal: number;
  assetUnitsWithoutSerial: number;
  /** Purchase cost of single units still owned (IV-03). */
  assetValueLabel: string;
  assetNextCheckDue: string | null;
  chainCheckedAt: string | null;
  kitFullCount: number;
  kitVehicleCount: number;
  assetsFaulty: number;
  assetsLost: number;
  assetsInRepair: number;
  chainCheckOk: boolean | null;
  stockItemCount: number;
  movements: Record<string, unknown>[];
  movementsTotal: number;
  assets: Record<string, unknown>[];
  alerts: Record<string, unknown>[];
  complianceRows: Record<string, unknown>[];
  selectedItem: Record<string, unknown> | null;
  selectedAsset: Record<string, unknown> | null;
};

function splitStoreVsCarsValue(
  stockRows: Record<string, unknown>[],
  overviewKpis: Record<string, unknown> | null,
): { inStore: number; onCars: number } {
  const inStoreKpi = numField(overviewKpis ?? {}, 'in_store_value', NaN);
  const onCarsKpi = numField(overviewKpis ?? {}, 'on_vehicle_value', NaN);
  if (Number.isFinite(inStoreKpi) || Number.isFinite(onCarsKpi)) {
    return {
      inStore: Number.isFinite(inStoreKpi) ? inStoreKpi : 0,
      onCars: Number.isFinite(onCarsKpi) ? onCarsKpi : 0,
    };
  }

  let inStore = 0;
  let onCars = 0;
  for (const row of stockRows) {
    const value = numField(row, 'stock_value', 0);
    const loc = strField(row, 'location_name', '').toLowerCase();
    const code = strField(row, 'location_code', '').toLowerCase();
    if (loc.includes('vehicle') || code.startsWith('veh')) onCars += value;
    else inStore += value;
  }
  return { inStore, onCars };
}

function countAssetsByStatus(assets: Record<string, unknown>[], status: string): number {
  return assets.filter((a) => strField(a, 'status', '').toLowerCase() === status).length;
}

export function buildInventoryLive(shell: InventoryShellState): InventoryLive {
  const overview = shell.overview ?? {};
  const kpis = asRecord(overview.stockKpis);
  const alertTiles = asRecord(overview.alerts);
  const kitMeta = asRecord(overview.kitCompleteness);

  const stockRows = shell.stockRows;
  // IV-03: balances + single units (assets) still owned, each on its own side.
  const assetValue = asRecord(overview.assetValue);
  const assetStore = numField(assetValue, 'store', 0);
  const assetCars = numField(assetValue, 'cars', 0);
  const split = splitStoreVsCarsValue(stockRows, kpis);
  const inStore = split.inStore + assetStore;
  const onCars = split.onCars + assetCars;
  const totalRaw = sumStockValue(stockRows) + assetStore + assetCars;

  const complianceRows = shell.kitComplianceRows;
  const kitVehicles = aggregateKitVehicles(complianceRows);
  const primaryVehicle = kitVehicles[0] ?? null;
  const secondaryVehicle = kitVehicles[1] ?? null;

  // IV-02: low or out is worked out against what the cars need.
  const storeNeeds = storeNeedsFrom(shell.overview);
  const lowOrOut = storeNeeds
    .filter((n) => n.status !== 'ok')
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'out' ? -1 : 1));
  const lowStockLabel = lowOrOut.length ? lowOrOut.map((n) => n.name).join(', ') : '—';

  const kitFullCount = kitVehicles.filter((v) => v.requiredLines > 0 && v.okLines === v.requiredLines).length;
  const missingRequiredTotal = kitVehicles.reduce((sum, v) => sum + v.missingLines + v.shortLines, 0);
  const kitVehicleCount =
    typeof kitMeta.activeVehicles === 'number'
      ? kitMeta.activeVehicles
      : kitVehicles.length;

  const assets = shell.assets;
  const assetsFaulty = countAssetsByStatus(assets, 'faulty');
  const assetsLost = countAssetsByStatus(assets, 'lost');
  const assetsInRepair = countAssetsByStatus(assets, 'in_repair');

  const openAlertCount =
    numField(alertTiles, 'open_alerts', NaN) ||
    shell.alerts.filter((a) => strField(a, 'status', '') === 'open').length;

  const chain = asRecord(overview.chainCheck);
  const chainCheckOk = typeof chain.ok === 'boolean' ? chain.ok : null;
  const chainCheckedAt = typeof chain.checked_at === 'string' ? chain.checked_at : null;

  const hubName = primaryWarehouseLabel(stockRows);
  const hubShort = hubName.split('—')[0]?.trim() || hubName;

  const selectedItem =
    shell.selectedItemId != null
      ? (stockRows.find((r) => strField(r, 'item_id', '') === shell.selectedItemId) ??
        shell.items.find((r) => strField(r, 'id', '') === shell.selectedItemId) ??
        null)
      : null;

  const selectedAsset =
    shell.selectedAssetId != null
      ? (assets.find((a) => strField(a, 'id', '') === shell.selectedAssetId) ?? null)
      : null;

  return {
    hubName,
    hubShort,
    totalStockValue: formatStockValue(totalRaw),
    totalStockValueRaw: totalRaw,
    inStoreValue: formatStockValue(inStore),
    onCarsValue: formatStockValue(onCars),
    openAlertCount,
    kitVehicles,
    primaryPlate: primaryVehicle?.plate ?? formatPlate(strField(selectedAsset ?? {}, 'vehicle_plate', '')),
    secondaryPlate: secondaryVehicle?.plate ?? '—',
    primaryVehicle,
    secondaryVehicle,
    lowStockCount: lowOrOut.length,
    lowStockLabel,
    lowOrOut,
    storeNeeds,
    missingRequiredTotal,
    assetUnitsWithoutSerial: numField(assetValue, 'unitsWithoutSerial', 0),
    assetValueLabel: formatStockValue(assetStore + assetCars),
    assetNextCheckDue: typeof assetValue.nextCheckDue === 'string' ? assetValue.nextCheckDue : null,
    chainCheckedAt,
    kitFullCount,
    kitVehicleCount,
    assetsFaulty,
    assetsLost,
    assetsInRepair,
    chainCheckOk,
    stockItemCount: stockRows.length,
    movements: shell.movements,
    movementsTotal: shell.movementsTotal,
    assets,
    alerts: shell.alerts,
    complianceRows,
    selectedItem,
    selectedAsset,
  };
}

export function useInventoryLive(shell: InventoryShellState): InventoryLive {
  return useMemo(
    () => buildInventoryLive(shell),
    [
      shell.overview,
      shell.stockRows,
      shell.kitComplianceRows,
      shell.movements,
      shell.movementsTotal,
      shell.assets,
      shell.alerts,
      shell.items,
      shell.selectedItemId,
      shell.selectedAssetId,
    ],
  );
}
