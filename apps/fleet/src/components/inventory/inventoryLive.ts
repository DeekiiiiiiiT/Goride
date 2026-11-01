import { useMemo } from 'react';
import {
  aggregateKitVehicles,
  asRecord,
  formatPlate,
  formatStockValue,
  numField,
  primaryWarehouseLabel,
  strField,
  sumStockValue,
  type KitVehicleSummary,
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
  kitFullCount: number;
  kitVehicleCount: number;
  devicesNeedingAttention: number;
  openPoCount: number;
  chainCheckOk: boolean | null;
  stockItemCount: number;
  movements: Record<string, unknown>[];
  movementsTotal: number;
  assets: Record<string, unknown>[];
  alerts: Record<string, unknown>[];
  purchaseOrders: Record<string, unknown>[];
  vendors: Record<string, unknown>[];
  countSessions: Record<string, unknown>[];
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

export function buildInventoryLive(shell: InventoryShellState): InventoryLive {
  const overview = shell.overview ?? {};
  const kpis = asRecord(overview.stockKpis);
  const alertTiles = asRecord(overview.alerts);
  const kitMeta = asRecord(overview.kitCompleteness);

  const stockRows = shell.stockRows;
  const totalRaw =
    numField(kpis, 'total_stock_value', NaN) ||
    numField(kpis, 'stock_value', NaN) ||
    sumStockValue(stockRows);
  const { inStore, onCars } = splitStoreVsCarsValue(stockRows, kpis);

  const complianceRows = shell.kitComplianceRows;
  const kitVehicles = aggregateKitVehicles(complianceRows);
  const primaryVehicle = kitVehicles[0] ?? null;
  const secondaryVehicle = kitVehicles[1] ?? null;

  const lowStockRows = stockRows.filter((r) => {
    const s = strField(r, 'stock_status', 'ok');
    return s === 'low' || s === 'out';
  });
  const lowStockLabel = lowStockRows[0]
    ? strField(lowStockRows[0], 'name', '—')
    : '—';

  const kitFullCount = kitVehicles.filter((v) => v.pct >= 100).length;
  const kitVehicleCount =
    typeof kitMeta.activeVehicles === 'number'
      ? kitMeta.activeVehicles
      : kitVehicles.length;

  const assets = shell.assets;
  const devicesNeedingAttention = assets.filter((a) => {
    const serial = strField(a, 'serial_number', strField(a, 'serial_no', ''));
    const status = strField(a, 'status', '');
    return !serial || status === 'faulty' || status === 'repair';
  }).length;

  const openAlertCount =
    numField(alertTiles, 'open_alerts', NaN) ||
    shell.alerts.filter((a) => strField(a, 'status', '') === 'open').length;

  const openPoCount = shell.purchaseOrders.filter((po) => {
    const st = strField(po, 'status', '').toLowerCase();
    return st && !['received', 'cancelled', 'closed'].includes(st);
  }).length;

  const chain = asRecord(overview.chainCheck);
  const chainCheckOk = typeof chain.ok === 'boolean' ? chain.ok : null;

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
    lowStockCount: lowStockRows.length,
    lowStockLabel,
    kitFullCount,
    kitVehicleCount,
    devicesNeedingAttention,
    openPoCount,
    chainCheckOk,
    stockItemCount: stockRows.length,
    movements: shell.movements,
    movementsTotal: shell.movementsTotal,
    assets,
    alerts: shell.alerts,
    purchaseOrders: shell.purchaseOrders,
    vendors: shell.vendors,
    countSessions: shell.countSessions,
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
      shell.purchaseOrders,
      shell.vendors,
      shell.countSessions,
      shell.items,
      shell.selectedItemId,
      shell.selectedAssetId,
    ],
  );
}
