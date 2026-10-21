/**
 * One physical fill for a week. Gas-card purchases are often stored twice
 * (manual log + card transaction at the same odometer). Every money reader
 * must use this list so the pair is not added twice.
 */
import type { FuelEntry } from './fuelTypes.ts';
import {
  countsInFuelLogSpend,
  filterFuelOpsLogEntries,
  fuelOpsLiters,
  fuelOpsSpendAmount,
  isGasCardFuelEntry,
} from './fuelOpsEligibility.ts';

export type WeekFuelFill = {
  cardTxId?: string;
  manualEntryId?: string;
  paymentSource: 'gas_card' | 'cash';
  amount: number;
  litres: number;
  odometer: number | null;
  vehicleId?: string;
  driverId?: string;
  date?: string;
};

function ymd(value: unknown): string {
  return String(value || '').split('T')[0];
}

function isManual(entry: FuelEntry): boolean {
  return entry.type === 'Manual_Entry' || entry.type === 'Fuel_Manual_Entry';
}

function samePhysicalFill(a: WeekFuelFill, entry: FuelEntry, amount: number): boolean {
  const odo = entry.odometer != null ? Number(entry.odometer) : null;
  if (!a.vehicleId || a.vehicleId !== entry.vehicleId) return false;
  if (a.odometer == null || odo == null || a.odometer !== odo) return false;
  if (Math.abs(a.amount - amount) > 0.02) return false;
  const dayA = ymd(a.date);
  const dayB = ymd(entry.date);
  return !dayA || !dayB || dayA === dayB;
}

export function selectWeekFuelFills(entries: FuelEntry[]): WeekFuelFill[] {
  const ops = filterFuelOpsLogEntries(entries || []).filter((entry) => countsInFuelLogSpend(entry));
  const sorted = [...ops].sort((a, b) => {
    const day = ymd(a.date).localeCompare(ymd(b.date));
    if (day !== 0) return day;
    return (Number(a.odometer) || 0) - (Number(b.odometer) || 0);
  });
  const out: WeekFuelFill[] = [];
  for (const entry of sorted) {
    const amount = fuelOpsSpendAmount(entry);
    if (amount <= 0) continue;
    const previous = out[out.length - 1];
    if (previous && samePhysicalFill(previous, entry, amount)) {
      if (entry.type === 'Card_Transaction' && !previous.cardTxId) previous.cardTxId = entry.id;
      if (isManual(entry) && !previous.manualEntryId) previous.manualEntryId = entry.id;
      continue;
    }
    out.push({
      cardTxId: entry.type === 'Card_Transaction' ? entry.id : undefined,
      manualEntryId: isManual(entry) ? entry.id : undefined,
      paymentSource: isGasCardFuelEntry(entry) ? 'gas_card' : 'cash',
      amount,
      litres: fuelOpsLiters(entry),
      odometer: entry.odometer != null ? Number(entry.odometer) : null,
      vehicleId: entry.vehicleId,
      driverId: entry.driverId,
      date: ymd(entry.date),
    });
  }
  return out;
}

export function sumWeekFuelFills(fills: WeekFuelFill[]): {
  totalSpend: number;
  gasCard: number;
  cash: number;
} {
  let gasCard = 0;
  let cash = 0;
  for (const fill of fills) {
    if (fill.paymentSource === 'gas_card') gasCard += fill.amount;
    else cash += fill.amount;
  }
  return {
    totalSpend: Math.round((gasCard + cash) * 100) / 100,
    gasCard: Math.round(gasCard * 100) / 100,
    cash: Math.round(cash * 100) / 100,
  };
}
