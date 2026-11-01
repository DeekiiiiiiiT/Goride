import type { Paged } from './inventoryApi';
import { formatJmd } from './inventoryFormat';

export type KitVehicleSummary = {
  vehicleId: string;
  plate: string;
  requiredLines: number;
  okLines: number;
  missingLines: number;
  shortLines: number;
  pct: number;
  missingLabels: string[];
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asPagedItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  const p = payload as Paged<Record<string, unknown>> | { items?: unknown[] };
  if (Array.isArray(p?.items)) return p.items as Record<string, unknown>[];
  return [];
}

export function pagedTotal(payload: unknown): number | undefined {
  const p = payload as { total?: number; items?: unknown[] };
  if (typeof p?.total === 'number') return p.total;
  if (Array.isArray(p?.items)) return p.items.length;
  return undefined;
}

export function strField(row: Record<string, unknown>, key: string, fallback = '—'): string {
  const v = row[key];
  if (v == null || v === '') return fallback;
  return String(v);
}

export function numField(row: Record<string, unknown>, key: string, fallback = 0): number {
  const n = Number(row[key]);
  return Number.isFinite(n) ? n : fallback;
}

export function formatPlate(plate: string | null | undefined): string {
  const v = String(plate ?? '').trim();
  return v ? v.toUpperCase() : '—';
}

export function sumStockValue(rows: Record<string, unknown>[]): number {
  return rows.reduce((sum, row) => sum + numField(row, 'stock_value', 0), 0);
}

export function primaryWarehouseLabel(rows: Record<string, unknown>[]): string {
  const warehouse = rows.find((r) => {
    const code = strField(r, 'location_code', '').toLowerCase();
    const name = strField(r, 'location_name', '').toLowerCase();
    return !code.startsWith('veh') && !name.includes('vehicle');
  });
  const pick = warehouse ?? rows[0];
  if (!pick) return '—';
  const name = strField(pick, 'location_name', '');
  const code = strField(pick, 'location_code', '');
  if (name && code) return `${name} (${code})`;
  return name || code || '—';
}

export function aggregateKitVehicles(complianceRows: Record<string, unknown>[]): KitVehicleSummary[] {
  const byVehicle = new Map<string, KitVehicleSummary>();

  for (const row of complianceRows) {
    const vehicleId = strField(row, 'vehicle_id', '');
    if (!vehicleId) continue;
    let entry = byVehicle.get(vehicleId);
    if (!entry) {
      entry = {
        vehicleId,
        plate: formatPlate(strField(row, 'license_plate', '')),
        requiredLines: 0,
        okLines: 0,
        missingLines: 0,
        shortLines: 0,
        pct: 0,
        missingLabels: [],
      };
      byVehicle.set(vehicleId, entry);
    }
    entry.requiredLines += 1;
    const status = strField(row, 'line_status', '');
    if (status === 'ok' || status === 'linked') entry.okLines += 1;
    else if (status === 'missing') {
      entry.missingLines += 1;
      entry.missingLabels.push(strField(row, 'item_id', 'Item'));
    } else if (status === 'short') entry.shortLines += 1;
  }

  return [...byVehicle.values()]
    .map((v) => ({
      ...v,
      pct: v.requiredLines ? Math.round((v.okLines / v.requiredLines) * 100) : 0,
    }))
    .sort((a, b) => a.plate.localeCompare(b.plate));
}

export function stockStatusLabel(status: string): string {
  switch (status) {
    case 'out':
      return 'Out';
    case 'low':
      return 'Low';
    default:
      return 'OK';
  }
}

export function formatStockValue(amount: number | null | undefined): string {
  return formatJmd(amount);
}
