/**
 * Parse freight customer/suite CSV for Mailbox Suites import.
 * Matches BShip'D-style exports and the Roam sample template.
 */

export type SuiteImportRow = {
  suiteCode: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  trn: string | null;
  clientName: string | null;
  pickupBranch: string | null;
  defaultFulfillmentMode: 'pickup' | 'door_delivery';
  defaultAssigneeType: 'org_fleet' | 'roam_marketplace' | 'client_fleet' | 'third_party';
  deliveryAddress: string | null;
  line: number;
};

export type SuiteCsvParseResult = {
  rows: SuiteImportRow[];
  errors: string[];
};

const HEADER_ALIASES: Record<string, keyof Omit<SuiteImportRow, 'line'>> = {
  suite_code: 'suiteCode',
  suitecode: 'suiteCode',
  suite: 'suiteCode',
  mailbox: 'suiteCode',
  mailbox_number: 'suiteCode',
  mailbox_no: 'suiteCode',
  code: 'suiteCode',
  contact_name: 'contactName',
  name: 'contactName',
  customer_name: 'contactName',
  full_name: 'contactName',
  contact_phone: 'contactPhone',
  phone: 'contactPhone',
  mobile: 'contactPhone',
  contact_email: 'contactEmail',
  email: 'contactEmail',
  trn: 'trn',
  client: 'clientName',
  client_name: 'clientName',
  pickup_branch: 'pickupBranch',
  pickup_facility: 'pickupBranch',
  branch: 'pickupBranch',
  default_pickup_facility: 'pickupBranch',
  default_fulfillment_mode: 'defaultFulfillmentMode',
  fulfillment: 'defaultFulfillmentMode',
  fulfillment_mode: 'defaultFulfillmentMode',
  default_assignee_type: 'defaultAssigneeType',
  assignee_type: 'defaultAssigneeType',
  fleet_default: 'defaultAssigneeType',
  delivery_address: 'deliveryAddress',
  jamaica_address: 'deliveryAddress',
  address: 'deliveryAddress',
};

/** Minimal CSV splitter — handles quoted commas/newlines. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    // Skip trailing empty line
    if (row.length === 1 && row[0] === '' && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushCell();
    } else if (ch === '\n') {
      pushCell();
      pushRow();
    } else if (ch === '\r') {
      // ignore; \r\n handled via \n
    } else {
      cell += ch;
    }
  }
  pushCell();
  if (row.length > 1 || (row.length === 1 && row[0] !== '')) pushRow();
  return rows;
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function pickFulfillment(raw: string | undefined): 'pickup' | 'door_delivery' {
  const v = (raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (v === 'door' || v === 'door_delivery' || v === 'delivery' || v === 'home') {
    return 'door_delivery';
  }
  return 'pickup';
}

function pickAssignee(
  raw: string | undefined,
): 'org_fleet' | 'roam_marketplace' | 'client_fleet' | 'third_party' {
  const v = (raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (v === 'roam_marketplace' || v === 'marketplace' || v === 'auto_dispatch') {
    return 'roam_marketplace';
  }
  if (v === 'client_fleet' || v === 'client') return 'client_fleet';
  if (v === 'third_party' || v === '3pl') return 'third_party';
  return 'org_fleet';
}

/** Full column set matching Add customer form (client + branch matched by name/code on import). */
export const SUITE_CSV_TEMPLATE = `suite_code,client_name,contact_name,contact_phone,contact_email,trn,default_fulfillment_mode,default_assignee_type,pickup_branch,delivery_address
JA-1001,,Jane Doe,8765550100,jane.doe@example.com,123456789,pickup,org_fleet,,
JA-1002,,John Doe,8765550101,john.doe@example.com,,pickup,org_fleet,,
`;

export function parseSuiteCsv(text: string): SuiteCsvParseResult {
  const table = parseCsvText(text);
  const errors: string[] = [];
  if (table.length < 2) {
    return { rows: [], errors: ['CSV must include a header row and at least one data row.'] };
  }

  const headers = table[0].map(normHeader);
  const colIndex = new Map<keyof Omit<SuiteImportRow, 'line'>, number>();
  headers.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key && !colIndex.has(key)) colIndex.set(key, i);
  });

  // BShip'D air line2 often carries mailbox when suite_code missing
  const airLine2Idx = headers.indexOf('air_address_line2');
  const airNameIdx = headers.indexOf('air_name');

  if (!colIndex.has('suiteCode') && airLine2Idx < 0) {
    return {
      rows: [],
      errors: [
        'Missing suite column. Use suite_code (or mailbox / air_address_line2).',
      ],
    };
  }

  const seen = new Map<string, number>();
  const rows: SuiteImportRow[] = [];

  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const cells = table[r];
    const get = (key: keyof Omit<SuiteImportRow, 'line'>) => {
      const idx = colIndex.get(key);
      if (idx == null) return '';
      return (cells[idx] ?? '').trim();
    };

    let suiteCode = get('suiteCode').toUpperCase();
    if (!suiteCode && airLine2Idx >= 0) {
      suiteCode = (cells[airLine2Idx] ?? '').trim().toUpperCase();
    }
    if (!suiteCode) {
      errors.push(`Line ${line}: missing suite code`);
      continue;
    }
    if (suiteCode.length < 2 || suiteCode.length > 40) {
      errors.push(`Line ${line}: suite code must be 2–40 characters (${suiteCode})`);
      continue;
    }

    let contactName = get('contactName') || null;
    if (!contactName && airNameIdx >= 0) {
      contactName = (cells[airNameIdx] ?? '').trim() || null;
    }

    const emailRaw = get('contactEmail');
    if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      errors.push(`Line ${line}: invalid email (${emailRaw})`);
      continue;
    }

    const row: SuiteImportRow = {
      suiteCode,
      contactName,
      contactPhone: get('contactPhone') || null,
      contactEmail: emailRaw || null,
      trn: get('trn') || null,
      clientName: get('clientName') || null,
      pickupBranch: get('pickupBranch') || null,
      defaultFulfillmentMode: pickFulfillment(get('defaultFulfillmentMode')),
      defaultAssigneeType: pickAssignee(get('defaultAssigneeType')),
      deliveryAddress: get('deliveryAddress') || null,
      line,
    };

    const prev = seen.get(suiteCode);
    if (prev != null) {
      // Last row wins; drop earlier duplicate from output
      const idx = rows.findIndex((x) => x.suiteCode === suiteCode);
      if (idx >= 0) rows.splice(idx, 1);
      errors.push(`Line ${line}: duplicate suite ${suiteCode} (replaces line ${prev})`);
    }
    seen.set(suiteCode, line);
    rows.push(row);
  }

  return { rows, errors };
}
