/**
 * JAA Raw fuel-card CSV → FuelEntry mapping.
 * Trust boundary: CARD_CODE / money / station / RESPONSE from JAA.
 * DRIVER_NAME, LICENSE_NUMBER, MILEAGE, DRIVER_REFERENCE_NUMBER are metadata noise only.
 */

import type { FuelCard, FuelEntry } from '../types/fuel';
import { findFuelCardByCode } from './fuelCardMatch';

export type JaaRowKind = 'approved_fuel' | 'fee' | 'declined';

export type ParsedRow = Record<string, string | number | undefined>;

function getVal(row: ParsedRow, keys: string[]): string | undefined {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim();
    const found = Object.keys(row).find((rk) => rk.toLowerCase().trim() === k.toLowerCase().trim());
    if (found && row[found] !== undefined && row[found] !== '') return String(row[found]).trim();
  }
  return undefined;
}

function parseAmount(raw: string | undefined): number {
  if (!raw) return NaN;
  return parseFloat(raw.replace(/[^0-9.-]/g, ''));
}

/** Parse JAA TRANS_DATE like 08/05/2026 20:24:00 (MM/DD/YYYY). */
export function parseJaaTransDate(raw: string | undefined): { date: string; time?: string } | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // MM/DD/YYYY HH:mm:ss or MM/DD/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (m[4] != null) {
      const hh = String(Number(m[4])).padStart(2, '0');
      const mm = String(Number(m[5])).padStart(2, '0');
      const ss = String(Number(m[6] || 0)).padStart(2, '0');
      return { date, time: `${hh}:${mm}:${ss}` };
    }
    return { date };
  }
  // ISO fallback
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const date = s.slice(0, 10);
    const timePart = s.includes('T') ? s.split('T')[1]?.slice(0, 8) : undefined;
    return { date, time: timePart };
  }
  return null;
}

export function classifyJaaRawRow(row: ParsedRow): JaaRowKind {
  const response = (getVal(row, ['RESPONSE', 'Response', 'Status']) || '').toUpperCase();
  const vendor = (getVal(row, ['VENDOR_NAME', 'Vendor', 'Merchant']) || '').toUpperCase();
  const fuelType = (getVal(row, ['FUEL_TYPE', 'Fuel Type']) || '').toUpperCase();
  const qty = parseAmount(getVal(row, ['DISPLAY_FUEL_QUANTITY', 'Fuel Quantity', 'Quantity']));
  const fuelAmt = parseAmount(getVal(row, ['DISPLAY_FUEL_AMOUNT', 'Fuel Amount']));

  if (
    response.includes('INVALID') ||
    response.includes('DECLIN') ||
    response.includes('DENIED') ||
    response.includes('REJECT')
  ) {
    return 'declined';
  }

  if (
    vendor.includes('SERVICE FEE') ||
    vendor.includes('CARD FEE') ||
    vendor.includes('CARD SERVICE') ||
    fuelType === '(NONE)' ||
    fuelType === 'NONE' ||
    ((!(qty > 0) && !(fuelAmt > 0)) && !response.startsWith('APPR'))
  ) {
    // Fees often show APPROVAL with zero fuel qty
    if (!(qty > 0) && !(fuelAmt > 0)) return 'fee';
  }

  if (!(qty > 0) && !(fuelAmt > 0) && !response.startsWith('APPR')) {
    return 'fee';
  }

  // Approved / near-limit fuel with volume or fuel amount
  if (qty > 0 || fuelAmt > 0 || response.startsWith('APPR')) {
    if (!(qty > 0) && !(fuelAmt > 0)) return 'fee';
    return 'approved_fuel';
  }

  return 'fee';
}

export function isJaaRawFuelCsv(headers: string[]): boolean {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const has = (k: string) => lower.includes(k.toLowerCase());
  return has('card_code') && has('trans_date') && (has('amount') || has('display_fuel_amount'));
}

/**
 * Map JAA Raw CSV rows → fuel entries.
 * @param existingReceiptNumbers — skip duplicates (RECEIPT_NUMBER)
 */
export function processJaaRawFuelData(
  rows: ParsedRow[],
  fuelCards: FuelCard[],
  existingReceiptNumbers: Set<string> = new Set(),
): { entries: FuelEntry[]; skippedDuplicates: number } {
  const entries: FuelEntry[] = [];
  let skippedDuplicates = 0;

  for (const row of rows) {
    const cardCode = getVal(row, ['CARD_CODE', 'Card Code', 'CardCode']);
    const receiptNumber = getVal(row, ['RECEIPT_NUMBER', 'Receipt Number', 'Receipt']);
    if (receiptNumber) {
      const key = receiptNumber.toUpperCase();
      if (existingReceiptNumbers.has(key)) {
        skippedDuplicates++;
        continue;
      }
      existingReceiptNumbers.add(key);
    }

    const parsed = parseJaaTransDate(getVal(row, ['TRANS_DATE', 'Trans Date', 'Transaction Date', 'Date']));
    if (!parsed) continue;

    const amountRaw = parseAmount(getVal(row, ['AMOUNT', 'Amount', 'Total']));
    if (isNaN(amountRaw)) continue;

    const kind = classifyJaaRawRow(row);
    const liters = parseAmount(getVal(row, ['DISPLAY_FUEL_QUANTITY', 'Fuel Quantity']));
    const fuelAmount = parseAmount(getVal(row, ['DISPLAY_FUEL_AMOUNT', 'Fuel Amount']));
    const response = getVal(row, ['RESPONSE', 'Response']) || '';
    const vendor = getVal(row, ['VENDOR_NAME', 'Vendor']) || undefined;
    const fuelType = getVal(row, ['FUEL_TYPE', 'Fuel Type']);
    const matchedCard = findFuelCardByCode(fuelCards, cardCode);

    // Issuer noise — never used for Roam identity
    const jaaDriverName = getVal(row, ['DRIVER_NAME', 'Driver Name']);
    const jaaPlate = getVal(row, ['LICENSE_NUMBER', 'License Number', 'Plate']);
    const jaaMileage = parseAmount(getVal(row, ['MILEAGE', 'Mileage', 'Odometer']));
    const jaaDriverRef = getVal(row, ['DRIVER_REFERENCE_NUMBER', 'Driver Reference']);

    const spendAmount = Math.abs(amountRaw);
    const isApprovedFuel = kind === 'approved_fuel';

    const entry: FuelEntry = {
      id: crypto.randomUUID(),
      date: parsed.date,
      time: parsed.time,
      amount: spendAmount,
      liters: isApprovedFuel && liters > 0 ? liters : undefined,
      pricePerLiter:
        isApprovedFuel && liters > 0
          ? Number((spendAmount / liters).toFixed(2))
          : undefined,
      location: vendor,
      // Roam odometer truth only — never JAA mileage
      odometer: null,
      cardId: matchedCard?.id,
      // Vehicle from Roam card assignment only — never JAA plate
      vehicleId: matchedCard?.assignedVehicleId,
      driverId: undefined,
      type: 'Card_Transaction',
      entryMode: 'Floating',
      paymentSource: 'Gas_Card',
      entrySource: 'fuel-card',
      reconciliationStatus: isApprovedFuel ? 'Pending' : 'Archived',
      metadata: {
        importSource: 'jaa_raw',
        jaaRowKind: kind,
        jaaCardCode: cardCode,
        jaaReceiptNumber: receiptNumber,
        jaaResponse: response,
        jaaFuelType: fuelType,
        jaaFuelAmount: !isNaN(fuelAmount) ? fuelAmount : undefined,
        // Noise for display/debug only — not security
        jaaDriverName,
        jaaVehiclePlate: jaaPlate,
        jaaMileage: !isNaN(jaaMileage) && jaaMileage > 0 ? jaaMileage : undefined,
        jaaDriverReference: jaaDriverRef,
        countsInFuelSpend: isApprovedFuel,
        countsInFuelVolume: isApprovedFuel && liters > 0,
      },
    };

    entries.push(entry);
  }

  return { entries, skippedDuplicates };
}
