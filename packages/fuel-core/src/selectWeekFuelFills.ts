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
  isFuelOpsLogEntry,
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

function linkedDriverEntryId(entry: FuelEntry): string | null {
  const meta = entry.metadata;
  if (!meta || typeof meta !== 'object') return null;
  const id = (meta as Record<string, unknown>).jaaMatchedDriverEntryId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function fillFromPair(primary: FuelEntry, twin?: FuelEntry): WeekFuelFill {
  const rows = twin ? [primary, twin] : [primary];
  const manual = rows.find(isManual);
  const card = rows.find((entry) => entry.type === 'Card_Transaction');
  const amountEntry =
    (manual && fuelOpsSpendAmount(manual) > 0 ? manual : undefined) ||
    (card && fuelOpsSpendAmount(card) > 0 ? card : undefined) ||
    primary;
  return {
    cardTxId: card?.id,
    manualEntryId: manual?.id,
    paymentSource: isGasCardFuelEntry(amountEntry) ? 'gas_card' : 'cash',
    amount: fuelOpsSpendAmount(amountEntry),
    litres: fuelOpsLiters(amountEntry),
    odometer: amountEntry.odometer != null ? Number(amountEntry.odometer) : null,
    vehicleId: amountEntry.vehicleId,
    driverId: amountEntry.driverId,
    date: ymd(amountEntry.date),
  };
}

export function selectWeekFuelFills(entries: FuelEntry[]): WeekFuelFill[] {
  const ops = filterFuelOpsLogEntries(entries || []).filter((entry) => countsInFuelLogSpend(entry));
  const byId = new Map(ops.map((entry) => [entry.id, entry]));
  const sorted = [...ops].sort((a, b) => {
    const day = ymd(a.date).localeCompare(ymd(b.date));
    if (day !== 0) return day;
    return (Number(a.odometer) || 0) - (Number(b.odometer) || 0);
  });
  const consumed = new Set<string>();
  const out: WeekFuelFill[] = [];

  for (const entry of sorted) {
    if (consumed.has(entry.id)) continue;
    const peerId = linkedDriverEntryId(entry);
    const peer = peerId && peerId !== entry.id ? byId.get(peerId) : undefined;
    if (peer && !consumed.has(peer.id)) {
      consumed.add(entry.id);
      consumed.add(peer.id);
      const fill = fillFromPair(entry, peer);
      if (fill.amount > 0) out.push(fill);
    }
  }

  for (const entry of sorted) {
    if (consumed.has(entry.id)) continue;
    const amount = fuelOpsSpendAmount(entry);
    if (amount <= 0) continue;
    const previous = out[out.length - 1];
    const previousIsPair = Boolean(previous?.cardTxId && previous?.manualEntryId);
    if (previous && !previousIsPair && samePhysicalFill(previous, entry, amount)) {
      if (entry.type === 'Card_Transaction' && !previous.cardTxId) previous.cardTxId = entry.id;
      if (isManual(entry) && !previous.manualEntryId) previous.manualEntryId = entry.id;
      consumed.add(entry.id);
      continue;
    }
    consumed.add(entry.id);
    out.push(fillFromPair(entry));
  }
  return out;
}

/** One ops row per physical fill, so a linked card twin is not added again. */
export function fuelEntriesForWeekEngine(entries: FuelEntry[]): FuelEntry[] {
  const byId = new Map((entries || []).map((entry) => [entry.id, entry]));
  const fills = selectWeekFuelFills(entries || []);
  const used = new Set<string>();
  const out: FuelEntry[] = [];
  for (const fill of fills) {
    const manual = fill.manualEntryId ? byId.get(fill.manualEntryId) : undefined;
    const card = fill.cardTxId ? byId.get(fill.cardTxId) : undefined;
    const chosen =
      (manual && fuelOpsSpendAmount(manual) > 0 ? manual : undefined) ||
      (card && fuelOpsSpendAmount(card) > 0 ? card : undefined) ||
      manual ||
      card;
    if (manual) used.add(manual.id);
    if (card) used.add(card.id);
    if (chosen) out.push(chosen);
  }
  for (const entry of entries || []) {
    if (!entry?.id || used.has(entry.id)) continue;
    if (!isFuelOpsLogEntry(entry)) continue;
    out.push(entry);
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
