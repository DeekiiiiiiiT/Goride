import { formatJmd } from './inventoryFormat';
import { formatPlate, numField, strField } from './inventoryData';
import type {
  AlertRow,
  AssetRow,
  CountSessionRow,
  CountVarianceLineRow,
  ItemDrawerRow,
  KitTemplateLineRow,
  PhoneComplianceRow,
  PoLineRow,
  PoSummaryRow,
  VehicleKitCardRow,
} from './inventoryTypes';

function lineId(line: Record<string, unknown>, index: number): string {
  return strField(line, 'id', strField(line, 'line_id', `line-${index}`));
}

export function poStatusNorm(po: Record<string, unknown>): string {
  return strField(po, 'status', strField(po, 'po_status', 'draft')).toLowerCase().replace(/\s+/g, '_');
}

export function poCanReceive(status: string): boolean {
  return status === 'ordered' || status === 'part_received';
}

export function buildPoLineRows(po: Record<string, unknown> | null, formatMoney: (n: number | null) => string): PoLineRow[] {
  if (!po) return [];
  const lines = Array.isArray(po.lines) ? (po.lines as Record<string, unknown>[]) : [];
  return lines.map((line, index) => {
    const qty = numField(line, 'qty_ordered', numField(line, 'ordered_qty', numField(line, 'qty', 0)));
    const received = numField(line, 'qty_received', numField(line, 'received_qty', 0));
    const unit = numField(line, 'unit_cost_jmd', numField(line, 'unit_price', numField(line, 'unit_cost', 0)));
    const total = numField(line, 'line_total_jmd', qty * unit);
    const sku = strField(line, 'sku', strField(line, 'item_sku', '—'));
    return {
      id: lineId(line, index),
      name: strField(line, 'name', strField(line, 'item_name', '—')),
      sku,
      orderedLabel: `${qty} ea`,
      receivedLabel: `${received} ea`,
      unitCost: formatMoney(unit || null),
      lineTotal: formatMoney(total || null),
      icon: sku.startsWith('SAF') ? 'warning' : sku.startsWith('TLS') ? 'tire_repair' : 'stay_current_portrait',
    };
  });
}

export function buildPoSummaryRow(
  po: Record<string, unknown>,
  hubShort: string,
  formatMoney: (n: number | null) => string,
): PoSummaryRow {
  const status = poStatusNorm(po);
  const lines = Array.isArray(po.lines) ? (po.lines as Record<string, unknown>[]) : [];
  const preview = lines
    .slice(0, 3)
    .map((l) => {
      const q = numField(l, 'qty_ordered', numField(l, 'qty', 0));
      const name = strField(l, 'name', strField(l, 'item_name', 'Item'));
      return `${q}× ${name}`;
    })
    .join(', ');
  const total = Number(strField(po, 'total_jmd', strField(po, 'total', '0')));
  const canReceive = poCanReceive(status);
  return {
    id: strField(po, 'id', ''),
    ref: strField(po, 'number', strField(po, 'po_number', '—')),
    vendorName: strField(po, 'vendor_name', '—'),
    status,
    statusLabel: status.replace(/_/g, ' '),
    hubLabel: hubShort,
    lineCount: lines.length,
    totalLabel: formatMoney(Number.isFinite(total) ? total : null),
    manifestPreview: preview || '—',
    expectedLabel: strField(po, 'expected_on', strField(po, 'expected_at', '—')),
    canReceive,
    receiveDisabledReason: canReceive
      ? ''
      : 'Enable when purchase order status is ordered or part received',
  };
}

export function buildAssetRow(asset: Record<string, unknown>, formatMoney: (n: number | null) => string): AssetRow {
  const st = strField(asset, 'status', '—');
  return {
    id: strField(asset, 'id', ''),
    name: strField(asset, 'name', strField(asset, 'item_name', '—')),
    serial: strField(asset, 'serial_number', strField(asset, 'serial_no', '—')),
    status: st,
    statusLabel: st.replace(/_/g, ' '),
    plate: formatPlate(strField(asset, 'license_plate', strField(asset, 'plate', ''))),
    bookValue: formatMoney(
      numField(asset, 'book_value_jmd', numField(asset, 'book_value', 0)) || null,
    ),
    category: strField(asset, 'category', strField(asset, 'asset_type', '—')),
  };
}

export function buildAlertRow(alert: Record<string, unknown>): AlertRow {
  return {
    id: strField(alert, 'id', ''),
    title: strField(alert, 'title', strField(alert, 'kind', 'Alert')),
    message: strField(alert, 'message', strField(alert, 'body', '')),
    severity: strField(alert, 'severity', strField(alert, 'priority', 'normal')),
    sku: strField(alert, 'sku', strField(alert, 'item_sku', '')),
    status: strField(alert, 'status', 'open'),
    assigneeLabel: strField(alert, 'assignee_name', strField(alert, 'assignee', '')),
    vehiclePlate: formatPlate(strField(alert, 'vehicle_plate', '')),
    kind: strField(alert, 'kind', ''),
  };
}

export function buildCountSessionRow(session: Record<string, unknown>): CountSessionRow {
  const auditor = strField(session, 'auditor_name', strField(session, 'auditor', '—'));
  const conducted = strField(session, 'conducted_at', strField(session, 'started_at', '—'));
  const approver = strField(session, 'approver_name', strField(session, 'approved_by', '—'));
  const matchPct = numField(session, 'match_pct', NaN);
  const matchPctLabel = Number.isFinite(matchPct) ? `${matchPct.toFixed(1)}%` : strField(session, 'match_pct_label', '—');
  const st = strField(session, 'status', 'open');
  const variance = strField(session, 'variance_summary', '—');
  return {
    id: strField(session, 'id', ''),
    ref: strField(session, 'reference', strField(session, 'number', '—')),
    status: st,
    auditorLabel: auditor,
    conductedLabel: conducted,
    locationLabel: strField(session, 'location_name', strField(session, 'location', '—')),
    varianceLabel: variance,
    code: strField(session, 'code', strField(session, 'reference', strField(session, 'number', '—'))),
    statusSummary: strField(session, 'status_summary', variance || st.replace(/_/g, ' ')),
    conductedSummary: conducted && auditor !== '—' ? `Conducted ${conducted} by ${auditor}` : conducted ? `Conducted ${conducted}` : '—',
    approverLabel: approver,
    matchPctLabel,
  };
}

export function buildCountVarianceLineRow(
  line: Record<string, unknown>,
  index: number,
  formatMoney: (n: number | null) => string,
): CountVarianceLineRow {
  const sku = strField(line, 'sku', strField(line, 'item_sku', '—'));
  const name = strField(line, 'name', strField(line, 'item_name', '—'));
  const detail = strField(line, 'detail', strField(line, 'description', ''));
  const expected = numField(line, 'expected_qty', numField(line, 'expected', NaN));
  const counted = numField(line, 'counted_qty', numField(line, 'counted', NaN));
  const unit = numField(line, 'unit_value_jmd', numField(line, 'unit_value', 0));
  const varVal = numField(line, 'variance_value_jmd', numField(line, 'variance_value', 0));
  const delta = numField(line, 'variance_qty', counted - expected);
  const deltaLabel =
    Number.isFinite(delta) && delta !== 0
      ? `${delta > 0 ? '+' : ''}${delta} ${name}`
      : strField(line, 'variance_label', '0 OK');
  return {
    id: strField(line, 'id', strField(line, 'line_id', `count-line-${index}`)),
    name,
    skuDetail: detail ? `${sku} · ${detail}` : sku,
    expectedLabel: Number.isFinite(expected) ? String(expected) : '—',
    countedLabel: Number.isFinite(counted) ? String(counted) : '—',
    varianceDeltaLabel: deltaLabel,
    unitValueLabel: formatMoney(unit || null),
    varianceValueLabel: formatMoney(varVal || null),
    approvalLabel: strField(line, 'approval_status', strField(line, 'approval_label', '—')),
  };
}

export function buildKitTemplateLineRow(line: Record<string, unknown>, index: number): KitTemplateLineRow {
  const qty = numField(line, 'qty', numField(line, 'required_qty', 1));
  return {
    key: strField(line, 'id', strField(line, 'key', `line-${index}`)),
    name: strField(line, 'name', strField(line, 'item_name', '—')),
    sku: strField(line, 'sku', strField(line, 'item_sku', '—')),
    qtyLabel: `${qty} ea`,
    category: strField(line, 'category', '—'),
  };
}

export function buildItemDrawerRow(item: Record<string, unknown> | null, formatMoney: (n: number | null) => string): ItemDrawerRow | null {
  if (!item) return null;
  const qty = numField(item, 'qty_on_hand', numField(item, 'on_hand', 0));
  return {
    id: strField(item, 'id', ''),
    name: strField(item, 'name', '—'),
    sku: strField(item, 'sku', '—'),
    qtyLabel: `${qty} ea`,
    locationLabel: strField(item, 'location_name', strField(item, 'bin_name', '—')),
    valueLabel: formatMoney(numField(item, 'stock_value_jmd', numField(item, 'value_jmd', 0)) || null),
  };
}

export function buildVehicleKitCardRow(
  vehicle: { vehicleId: string; plate: string; pct: number; missingLabels: string[] },
  itemSku: string,
  itemName: string,
): VehicleKitCardRow {
  return {
    vehicleId: vehicle.vehicleId,
    plate: vehicle.plate,
    pctLabel: `${vehicle.pct.toFixed(1)}%`,
    missingCount: vehicle.missingLabels.length,
    itemSku,
    itemName,
  };
}

export function buildPhoneComplianceRow(row: Record<string, unknown>, index: number): PhoneComplianceRow {
  return {
    id: strField(row, 'id', `phone-${index}`),
    label: strField(row, 'label', strField(row, 'name', 'Device')),
    sku: strField(row, 'sku', strField(row, 'item_sku', '—')),
    statusLabel: strField(row, 'status', '—'),
    detail: strField(row, 'detail', strField(row, 'note', '')),
  };
}

export { formatJmd };
