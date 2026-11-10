import type { Paged } from './inventoryApi';
import { formatJmd } from './inventoryFormat';

export type KitLineStatus = 'ok' | 'short' | 'missing';

/** One kit line for one car (row of v_inv_kit_compliance). */
export type KitCell = {
  vehicleId: string;
  plate: string;
  kitLineId: string;
  itemId: string | null;
  lineType: string;
  label: string;
  required: boolean;
  status: KitLineStatus;
  qtyRequired: number;
  onHandInCar: number;
  sortOrder: number;
};

/** One kit column (kit line) in sort order. */
export type KitColumn = {
  kitLineId: string;
  itemId: string | null;
  lineType: string;
  label: string;
  required: boolean;
  sortOrder: number;
};

export type KitVehicleSummary = {
  vehicleId: string;
  plate: string;
  /** Required lines only — optional lines never count. */
  requiredLines: number;
  okLines: number;
  missingLines: number;
  shortLines: number;
  pct: number;
  /** Item names of required lines that are missing or short. */
  missingLabels: string[];
  cells: KitCell[];
};

/** Row of v_inv_store_needs (from GET /overview storeNeeds). */
export type StoreNeed = {
  itemId: string;
  sku: string;
  name: string;
  storeOnHand: number;
  needed: number;
  status: 'out' | 'low' | 'ok';
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

function linkedLabel(lineType: string): string {
  if (lineType === 'linked_fuel_card') return 'Fuel card';
  if (lineType === 'linked_toll_tag') return 'Toll tag';
  return 'Kit item';
}

/** Normalise one v_inv_kit_compliance row. */
export function toKitCell(row: Record<string, unknown>): KitCell | null {
  const vehicleId = strField(row, 'vehicle_id', '');
  const kitLineId = strField(row, 'kit_line_id', '');
  if (!vehicleId || !kitLineId) return null;
  const lineType = strField(row, 'line_type', 'item');
  const raw = strField(row, 'line_status', 'missing');
  // Legacy "linked" (before the completion migration) counts as ok.
  const status: KitLineStatus = raw === 'ok' || raw === 'linked' ? 'ok' : raw === 'short' ? 'short' : 'missing';
  return {
    vehicleId,
    plate: formatPlate(strField(row, 'license_plate', '')),
    kitLineId,
    itemId: row.item_id ? String(row.item_id) : null,
    lineType,
    label: strField(row, 'line_label', strField(row, 'item_name', linkedLabel(lineType))),
    required: row.required !== false,
    status,
    qtyRequired: numField(row, 'qty_required', 1),
    onHandInCar: numField(row, 'on_hand_in_car', 0),
    sortOrder: numField(row, 'sort_order', 0),
  };
}

export function kitCells(complianceRows: Record<string, unknown>[]): KitCell[] {
  return complianceRows.map(toKitCell).filter((c): c is KitCell => c != null);
}

/** Kit lines in sort order — the grid's columns. */
export function kitColumns(complianceRows: Record<string, unknown>[]): KitColumn[] {
  const byLine = new Map<string, KitColumn>();
  for (const c of kitCells(complianceRows)) {
    if (!byLine.has(c.kitLineId)) {
      byLine.set(c.kitLineId, {
        kitLineId: c.kitLineId,
        itemId: c.itemId,
        lineType: c.lineType,
        label: c.label,
        required: c.required,
        sortOrder: c.sortOrder,
      });
    }
  }
  return [...byLine.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export function aggregateKitVehicles(complianceRows: Record<string, unknown>[]): KitVehicleSummary[] {
  const byVehicle = new Map<string, KitVehicleSummary>();

  for (const cell of kitCells(complianceRows)) {
    let entry = byVehicle.get(cell.vehicleId);
    if (!entry) {
      entry = {
        vehicleId: cell.vehicleId,
        plate: cell.plate,
        requiredLines: 0,
        okLines: 0,
        missingLines: 0,
        shortLines: 0,
        pct: 0,
        missingLabels: [],
        cells: [],
      };
      byVehicle.set(cell.vehicleId, entry);
    }
    entry.cells.push(cell);
    if (!cell.required) continue;
    entry.requiredLines += 1;
    if (cell.status === 'ok') entry.okLines += 1;
    else {
      if (cell.status === 'missing') entry.missingLines += 1;
      else entry.shortLines += 1;
      entry.missingLabels.push(cell.label);
    }
  }

  return [...byVehicle.values()]
    .map((v) => ({
      ...v,
      cells: [...v.cells].sort((a, b) => a.sortOrder - b.sortOrder),
      pct: v.requiredLines ? Math.round((v.okLines / v.requiredLines) * 100) : 0,
    }))
    .sort((a, b) => a.plate.localeCompare(b.plate));
}

/** Required lines a car still needs (missing or short), item lines only when itemsOnly. */
export function neededCells(vehicles: KitVehicleSummary[], itemsOnly = false): KitCell[] {
  return vehicles.flatMap((v) =>
    v.cells.filter((c) => c.required && c.status !== 'ok' && (!itemsOnly || c.itemId != null)),
  );
}

export function storeNeedsFrom(overview: Record<string, unknown> | null): StoreNeed[] {
  const raw = overview?.storeNeeds;
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const row = asRecord(r);
    const s = strField(row, 'need_status', 'ok');
    return {
      itemId: strField(row, 'item_id', ''),
      sku: strField(row, 'sku', ''),
      name: strField(row, 'name', 'Item'),
      storeOnHand: numField(row, 'store_on_hand', 0),
      needed: numField(row, 'needed', 0),
      status: s === 'out' || s === 'low' ? s : 'ok',
    };
  });
}

/** "Tyre pump — out (2 needed)" */
export function storeNeedLabel(n: StoreNeed): string {
  return `${n.name} — ${n.status === 'out' ? 'out' : 'low'} (${n.needed} needed)`;
}

/** Nightly check line (IV-05). Stale after 26 hours. */
export function chainCheckLine(
  checkedAt: string | null,
  ok: boolean | null,
  timezone: string,
  now: Date = new Date(),
): { text: string; stale: boolean } {
  if (!checkedAt) return { text: "Nightly check hasn't run yet", stale: true };
  const at = new Date(checkedAt);
  if (Number.isNaN(at.getTime())) return { text: "Nightly check hasn't run yet", stale: true };
  const stale = now.getTime() - at.getTime() > 26 * 3600 * 1000;
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  if (stale) {
    const date = new Intl.DateTimeFormat('en-JM', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(at);
    return { text: `Nightly check hasn't run since ${date}`, stale: true };
  }
  const time = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(at);
  const day = dayKey(at) === dayKey(now) ? 'today' : 'yesterday';
  const tail = ok === false ? 'stock numbers do not add up — see Movements' : 'all stock numbers add up';
  return { text: `Nightly check ran ${time} ${day} · ${tail}`, stale: false };
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
