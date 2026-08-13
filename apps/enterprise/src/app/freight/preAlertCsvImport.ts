import { parseCsvText } from '@/app/freight/suiteCsvImport';

export type PreAlertCsvRow = {
  suiteCode: string;
  tracking: string;
  description: string | null;
  declaredValueUsd: number | null;
  weightLbs: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  retailer: string | null;
  orderNumber: string | null;
  line: number;
};

export type PreAlertCsvParseResult = {
  rows: PreAlertCsvRow[];
  errors: string[];
};

const HEADER_ALIASES: Record<string, keyof Omit<PreAlertCsvRow, 'line'>> = {
  suite_code: 'suiteCode',
  suitecode: 'suiteCode',
  suite: 'suiteCode',
  mailbox: 'suiteCode',
  mailbox_number: 'suiteCode',
  mailbox_no: 'suiteCode',
  courier_tracking_number: 'tracking',
  tracking_number: 'tracking',
  tracking: 'tracking',
  tracking_no: 'tracking',
  barcode: 'tracking',
  description: 'description',
  contents: 'description',
  item: 'description',
  declared_value_usd: 'declaredValueUsd',
  declared_value: 'declaredValueUsd',
  value: 'declaredValueUsd',
  weight_lbs: 'weightLbs',
  weight: 'weightLbs',
  lbs: 'weightLbs',
  length_in: 'lengthIn',
  length: 'lengthIn',
  width_in: 'widthIn',
  width: 'widthIn',
  height_in: 'heightIn',
  height: 'heightIn',
  retailer: 'retailer',
  store: 'retailer',
  order_number: 'orderNumber',
  order: 'orderNumber',
  order_no: 'orderNumber',
  external_order_number: 'orderNumber',
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function num(raw: string | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number(String(raw).replace(/[,$]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export const PRE_ALERT_CSV_TEMPLATE = `suite_code,courier_tracking_number,description,declared_value_usd,weight_lbs,length_in,width_in,height_in,retailer,order_number
BSHPD10859,TBA332697976197,Olive oil dispenser,12.99,2.0,12,8,6,Amazon,111-7351808-5310605
BSHPD10859,1ZX350640373014185,Chair covers,14.99,3.1,16,12,8,Amazon,111-7351808-5310605
`;

export function parsePreAlertCsv(text: string): PreAlertCsvParseResult {
  const grid = parseCsvText(text);
  const errors: string[] = [];
  if (grid.length < 2) {
    return { rows: [], errors: ['CSV needs a header row and at least one data row.'] };
  }

  const headers = grid[0].map(normHeader);
  const col: Partial<Record<keyof Omit<PreAlertCsvRow, 'line'>, number>> = {};
  headers.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key) col[key] = i;
  });

  if (col.tracking == null) {
    return { rows: [], errors: ['Missing courier_tracking_number (or tracking) column.'] };
  }
  if (col.suiteCode == null) {
    return { rows: [], errors: ['Missing suite_code (or mailbox) column.'] };
  }

  const get = (cells: string[], key: keyof Omit<PreAlertCsvRow, 'line'>) => {
    const i = col[key];
    if (i == null) return '';
    return (cells[i] ?? '').trim();
  };

  const rows: PreAlertCsvRow[] = [];
  const seenTrack = new Set<string>();

  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    if (!cells.some((c) => c.trim())) continue;
    const line = r + 1;
    const suiteCode = get(cells, 'suiteCode').toUpperCase();
    const tracking = get(cells, 'tracking');
    if (!suiteCode) {
      errors.push(`Line ${line}: suite_code is required.`);
      continue;
    }
    if (!tracking) {
      errors.push(`Line ${line}: tracking is required.`);
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
      tracking,
      description: get(cells, 'description') || null,
      declaredValueUsd: num(get(cells, 'declaredValueUsd')),
      weightLbs: num(get(cells, 'weightLbs')),
      lengthIn: num(get(cells, 'lengthIn')),
      widthIn: num(get(cells, 'widthIn')),
      heightIn: num(get(cells, 'heightIn')),
      retailer: get(cells, 'retailer') || null,
      orderNumber: get(cells, 'orderNumber') || null,
      line,
    });
  }

  return { rows, errors };
}
