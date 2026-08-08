/**
 * Parse US warehouse → BShip'D manifesto CSV (customs-style columns).
 * Reuses CSV splitter from suite import.
 */
import { parseCsvText } from '@/app/freight/suiteCsvImport';

export type WarehouseManifestRow = {
  suiteCode: string;
  contactName: string | null;
  trn: string | null;
  courierTrackingNumber: string;
  description: string | null;
  weightLbs: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  declaredValueUsd: number | null;
  invoiceFileName: string | null;
  line: number;
};

export type WarehouseManifestParseResult = {
  rows: WarehouseManifestRow[];
  errors: string[];
};

const HEADER_ALIASES: Record<string, keyof Omit<WarehouseManifestRow, 'line'>> = {
  suite_code: 'suiteCode',
  suitecode: 'suiteCode',
  suite: 'suiteCode',
  mailbox: 'suiteCode',
  mailbox_number: 'suiteCode',
  mailbox_no: 'suiteCode',
  contact_name: 'contactName',
  name: 'contactName',
  customer_name: 'contactName',
  trn: 'trn',
  courier_tracking_number: 'courierTrackingNumber',
  tracking_number: 'courierTrackingNumber',
  tracking: 'courierTrackingNumber',
  tracking_no: 'courierTrackingNumber',
  barcode: 'courierTrackingNumber',
  description: 'description',
  contents: 'description',
  weight_lbs: 'weightLbs',
  weight: 'weightLbs',
  lbs: 'weightLbs',
  length_in: 'lengthIn',
  length: 'lengthIn',
  width_in: 'widthIn',
  width: 'widthIn',
  height_in: 'heightIn',
  height: 'heightIn',
  declared_value_usd: 'declaredValueUsd',
  declared_value: 'declaredValueUsd',
  value: 'declaredValueUsd',
  invoice_file_name: 'invoiceFileName',
  invoice: 'invoiceFileName',
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function num(raw: string | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number(String(raw).replace(/[,$]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Template BShip'D receives from US intake / warehouse WMS. */
export const WAREHOUSE_MANIFEST_CSV_TEMPLATE = `suite_code,contact_name,trn,courier_tracking_number,description,weight_lbs,length_in,width_in,height_in,declared_value_usd,invoice_file_name
BSHPD10859,Sadiki Thomas,123456789,1Z999AA10123456784,Nike shoes size 10,4.5,14,10,6,89.99,invoice-bshpd10859.pdf
BSHPD10860,Keisha Brown,,9400111899562537875981,"Electronics (phone case, charger)",2.1,10,8,4,45.00,invoice-bshpd10860.pdf
`;

export function parseWarehouseManifestCsv(text: string): WarehouseManifestParseResult {
  const grid = parseCsvText(text);
  const errors: string[] = [];
  if (grid.length < 2) {
    return { rows: [], errors: ['CSV needs a header row and at least one data row.'] };
  }

  const headers = grid[0].map(normHeader);
  const col: Partial<Record<keyof Omit<WarehouseManifestRow, 'line'>, number>> = {};
  headers.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key) col[key] = i;
  });

  if (col.courierTrackingNumber == null && col.suiteCode == null) {
    return {
      rows: [],
      errors: [
        'Missing required columns. Need courier_tracking_number (or tracking) and suite_code (or mailbox).',
      ],
    };
  }
  if (col.courierTrackingNumber == null) {
    return { rows: [], errors: ['Missing courier_tracking_number (or tracking) column.'] };
  }
  if (col.suiteCode == null) {
    return { rows: [], errors: ['Missing suite_code (or mailbox) column.'] };
  }

  const get = (cells: string[], key: keyof Omit<WarehouseManifestRow, 'line'>) => {
    const i = col[key];
    if (i == null) return '';
    return (cells[i] ?? '').trim();
  };

  const rows: WarehouseManifestRow[] = [];
  const seenTrack = new Set<string>();

  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    if (!cells.some((c) => c.trim())) continue;
    const line = r + 1;
    const suiteCode = get(cells, 'suiteCode').toUpperCase();
    const tracking = get(cells, 'courierTrackingNumber');
    if (!suiteCode) {
      errors.push(`Line ${line}: suite_code is required.`);
      continue;
    }
    if (!tracking) {
      errors.push(`Line ${line}: courier_tracking_number is required.`);
      continue;
    }
    const trackKey = tracking.toUpperCase();
    if (seenTrack.has(trackKey)) {
      errors.push(`Line ${line}: duplicate tracking ${tracking} in file.`);
      continue;
    }
    seenTrack.add(trackKey);

    rows.push({
      suiteCode,
      contactName: get(cells, 'contactName') || null,
      trn: get(cells, 'trn') || null,
      courierTrackingNumber: tracking,
      description: get(cells, 'description') || null,
      weightLbs: num(get(cells, 'weightLbs')),
      lengthIn: num(get(cells, 'lengthIn')),
      widthIn: num(get(cells, 'widthIn')),
      heightIn: num(get(cells, 'heightIn')),
      declaredValueUsd: num(get(cells, 'declaredValueUsd')),
      invoiceFileName: get(cells, 'invoiceFileName') || null,
      line,
    });
  }

  return { rows, errors };
}

export function downloadWarehouseManifestTemplate() {
  const blob = new Blob([WAREHOUSE_MANIFEST_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'roam-warehouse-manifest-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
