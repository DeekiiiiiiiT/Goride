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

export function firstVendorName(
  vendors: Record<string, unknown>[],
  fallback = 'No vendor on file',
): string {
  const v = vendors[0];
  return v ? strField(v, 'name', fallback) : fallback;
}

export function firstOpenPoNumber(
  orders: Record<string, unknown>[],
  fallback = '—',
): string {
  const po = orders[0];
  if (!po) return fallback;
  return strField(po, 'number', strField(po, 'po_number', fallback));
}

export function firstAssetSerial(
  assets: Record<string, unknown>[],
  fallback = '—',
): string {
  for (const a of assets) {
    const s = strField(a, 'serial_number', strField(a, 'serial_no', ''));
    if (s && s !== '—') return s;
  }
  return fallback;
}

export function itemLabelById(
  items: Record<string, unknown>[],
  stockRows: Record<string, unknown>[],
  itemId: string,
): { name: string; sku: string } {
  const fromStock = stockRows.find((r) => strField(r, 'item_id', '') === itemId);
  if (fromStock) {
    return {
      name: strField(fromStock, 'name', 'Item'),
      sku: strField(fromStock, 'sku', '—'),
    };
  }
  const fromItems = items.find((r) => strField(r, 'id', '') === itemId);
  if (fromItems) {
    return {
      name: strField(fromItems, 'name', 'Item'),
      sku: strField(fromItems, 'sku', '—'),
    };
  }
  return { name: 'Item', sku: '—' };
}

export function formatMovementWhen(iso: string): { date: string; time: string } {
  if (!iso) return { date: '—', time: '—' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: '' };
  return {
    date: d.toLocaleDateString('en-JM', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-JM', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function movementTypeIcon(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('revers')) return 'replay';
  if (t.includes('receive')) return 'input';
  if (t.includes('issue')) return 'output';
  if (t.includes('transfer')) return 'sync_alt';
  return 'swap_horiz';
}
