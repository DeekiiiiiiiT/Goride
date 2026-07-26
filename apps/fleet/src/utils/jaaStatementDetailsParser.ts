/**
 * Parser for JAA Advance "Customer Statement Details" Excel exports
 * (StatementDetails.xls — TRANSACTION REPORT BY VEHICLES).
 * Nested layout: vehicle header rows, then fee/fuel/payment line items.
 */

export interface JaaFuelLine {
  tranDate: string; // YYYY-MM-DD
  receiptNumber?: string;
  vendor?: string;
  mileage?: number;
  description: string; // e.g. FUEL E10-90
  quantity: number; // liters
  cost: number;
  vehiclePlate?: string;
  driverName?: string;
  vehicleModel?: string;
}

export interface JaaParseResult {
  accountLabel?: string;
  periodStart?: string;
  periodEnd?: string;
  invoiceNo?: string;
  fuelLines: JaaFuelLine[];
  skippedNonFuel: number;
}

function cellStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function toYmd(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel serial date
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = cellStr(v);
  // ISO-ish
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  // DD-Mon-YYYY or similar already converted by sheet lib
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) {
    return d.toISOString().slice(0, 10);
  }
  return undefined;
}

function toNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function normalizePlate(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function isFuelDescription(desc: string): boolean {
  const d = desc.toUpperCase();
  return d.startsWith('FUEL') || d.includes('E10') || d.includes('DIESEL') || d.includes('ULSD') || d.includes('UNLEADED');
}

function isSkipDescription(desc: string): boolean {
  const d = desc.toUpperCase();
  return (
    d.includes('FEE') ||
    d.includes('G.C.T') ||
    d.includes('GCT') ||
    d === 'TOTAL' ||
    d.includes('CARD TOTAL') ||
    d.includes('PAYMENT') ||
    d.includes('FUEL TOTAL') ||
    d.includes('NON-FUEL') ||
    d.includes('CHARGE TOTAL') ||
    d.includes('SUMMARY') ||
    d.includes('REFUND')
  );
}

/** True if sheet/file looks like JAA Statement Details (not Summary). */
export function isJaaStatementDetails(sheetName: string, sampleRows: unknown[][]): boolean {
  const name = (sheetName || '').toLowerCase();
  if (name.includes('statement details') || name.includes('customer statement details')) return true;
  const flat = sampleRows.slice(0, 25).flatMap((r) => r.map(cellStr).join(' ')).join(' ').toUpperCase();
  return flat.includes('TRANSACTION REPORT BY VEHICLES') || flat.includes('RECEIPT NUMBER');
}

/**
 * Parse a 2D sheet matrix (from SheetJS sheet_to_json header:1 / array-of-arrays).
 */
export function parseJaaStatementDetailsMatrix(rows: unknown[][]): JaaParseResult {
  const result: JaaParseResult = { fuelLines: [], skippedNonFuel: 0 };

  let currentPlate: string | undefined;
  let currentDriver: string | undefined;
  let currentModel: string | undefined;
  let pendingHeader: {
    tranDate?: string;
    receiptNumber?: string;
    vendor?: string;
    mileage?: number;
    receiptTotal?: number;
  } | null = null;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const cols = row.map(cellStr);

    // Account / period metadata
    for (let c = 0; c < cols.length; c++) {
      const v = cols[c];
      if (/DIGITAL GOODYS|Account No/i.test(v) || /0000\d{4}/.test(v)) {
        if (!result.accountLabel && v) result.accountLabel = v;
      }
      if (/JAA Invoice No/i.test(v) && cols[c + 1]) {
        result.invoiceNo = cols[c + 1];
      }
    }

    // Vehicle header: LIC# + model in nearby columns (e.g. 1505LM | 2018 | HONDA FIT HYBRID)
    const plateCandidate = cols.find((c) => /^[A-Z0-9]{4,8}$/i.test(c) && /[A-Z]/i.test(c) && /\d/.test(c));
    const hasDriverLabel = cols.some((c) => /^DRIVER:?$/i.test(c));
    if (plateCandidate && cols.some((c) => /HYBRID|TOYOTA|HONDA|NISSAN|SUZUKI|BMW|FORD|CHEV|KIA|HYUNDAI/i.test(c) || /^\d{4}$/.test(c))) {
      // Prefer rows that look like vehicle blocks (not random plates in vendor names)
      const yearIdx = cols.findIndex((c) => /^\d{4}$/.test(c) && Number(c) >= 1990 && Number(c) <= 2100);
      if (yearIdx >= 0 || cols.some((c) => /HYBRID|FIT|CH-R|COROLLA|RAV/i.test(c))) {
        currentPlate = normalizePlate(plateCandidate);
        currentModel = cols.find((c) => /[A-Za-z].*[A-Za-z]/.test(c) && !/^\d+$/.test(c) && c !== plateCandidate && !/^DRIVER/i.test(c));
      }
    }
    if (hasDriverLabel) {
      const di = cols.findIndex((c) => /^DRIVER:?$/i.test(c));
      if (di >= 0 && cols[di + 1]) currentDriver = cols[di + 1];
    }

    // Transaction header row: date + receipt + vendor + mileage + RECEIPT TOTAL
    const dateYmd = toYmd(row[1] ?? row[0]);
    const receiptLike = cols.find((c) => /^ZZ\d+|^\d{5,}-\d+$/i.test(c));
    const vendorLike = cols.find((c) => /SERVICE|LUBE|PETROL|GAS|STATION|SHELL|TOTAL|RUBiS|JAMPET/i.test(c));
    const descIdx = cols.findIndex((c) => /^TOTAL$/i.test(c) || isFuelDescription(c) || isSkipDescription(c));

    // Explicit product line: DESCRIPTION in a known column with quantity + cost
    for (let c = 0; c < row.length; c++) {
      const desc = cellStr(row[c]);
      if (!desc) continue;

      if (isFuelDescription(desc)) {
        // Quantity and cost usually follow description
        let quantity: number | undefined;
        let cost: number | undefined;
        for (let k = c + 1; k < Math.min(row.length, c + 8); k++) {
          const n = toNum(row[k]);
          if (n == null) continue;
          if (quantity == null && n > 0 && n < 500) quantity = n;
          else if (cost == null && n >= 100) cost = n;
        }
        // Fallback: use pending header receipt total
        if (cost == null && pendingHeader?.receiptTotal) cost = pendingHeader.receiptTotal;
        if (quantity != null && quantity > 0 && cost != null && cost > 0) {
          result.fuelLines.push({
            tranDate: pendingHeader?.tranDate || dateYmd || '',
            receiptNumber: pendingHeader?.receiptNumber || receiptLike,
            vendor: pendingHeader?.vendor || vendorLike,
            mileage: pendingHeader?.mileage,
            description: desc,
            quantity,
            cost,
            vehiclePlate: currentPlate,
            driverName: currentDriver,
            vehicleModel: currentModel,
          });
          pendingHeader = null;
        } else {
          result.skippedNonFuel++;
        }
        continue;
      }

      if (isSkipDescription(desc) && desc.toUpperCase() !== 'TOTAL') {
        // count fee lines etc.
        if (/FEE|PAYMENT|G\.C\.T|GCT/i.test(desc)) result.skippedNonFuel++;
      }
    }

    // Capture pending TOTAL header (date + receipt + vendor + mileage + receipt total)
    if (dateYmd && (receiptLike || vendorLike) && cols.some((c) => /^TOTAL$/i.test(c))) {
      const mileage = toNum(row.find((_, i) => i >= 8 && i <= 12));
      // RECEIPT TOTAL often near end
      let receiptTotal: number | undefined;
      for (let i = row.length - 1; i >= 0; i--) {
        const n = toNum(row[i]);
        if (n != null && Math.abs(n) >= 50) {
          receiptTotal = Math.abs(n);
          break;
        }
      }
      pendingHeader = {
        tranDate: dateYmd,
        receiptNumber: receiptLike,
        vendor: vendorLike,
        mileage: mileage && mileage > 1000 ? mileage : undefined,
        receiptTotal,
      };
    }
  }

  // Drop lines missing date
  result.fuelLines = result.fuelLines.filter((l) => l.tranDate && l.quantity > 0 && l.cost > 0);
  return result;
}

/** Convert JAA fuel lines into flat ParsedRow objects for processFuelData / FuelEntry mapping. */
export function jaaFuelLinesToParsedRows(lines: JaaFuelLine[]): Record<string, string | number>[] {
  return lines.map((l) => ({
    Date: l.tranDate,
    'Transaction Date': l.tranDate,
    'Receipt Number': l.receiptNumber || '',
    'Card Number': '',
    Location: l.vendor || '',
    Station: l.vendor || '',
    Merchant: l.vendor || '',
    Volume: l.quantity,
    Liters: l.quantity,
    Amount: l.cost,
    Total: l.cost,
    Cost: l.cost,
    Price: l.quantity > 0 ? Number((l.cost / l.quantity).toFixed(2)) : '',
    Mileage: l.mileage ?? '',
    Odometer: l.mileage ?? '',
    Description: l.description,
    'Vehicle Plate': l.vehiclePlate || '',
    'License Plate': l.vehiclePlate || '',
    Driver: l.driverName || '',
    'Driver Name': l.driverName || '',
  }));
}
