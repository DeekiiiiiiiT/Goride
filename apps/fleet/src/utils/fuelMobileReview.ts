/**
 * Mobile-friendly review card projection for fuel entries.
 * Used by FuelCyclesPanel “Road review cards” and a future mobile sheet.
 */

import type { FuelEntry } from '../types/fuel';
import { formatFuelMoney } from './formatFuelMoney';
import { resolveFuelEntrySource } from './fuelEntrySource';

export type MobileFuelReviewCard = {
  id: string;
  title: string;
  subtitle: string;
  amount: string;
  status: string;
};

function entryStatus(e: FuelEntry): string {
  if (e.isLocked || e.status === 'Finalized') return 'Locked';
  if (e.reconciliationStatus === 'Flagged') return 'Flagged';
  if (e.metadata?.awaitingCardStatement) return 'Awaiting card';
  if (e.reconciliationStatus) return String(e.reconciliationStatus);
  return 'Open';
}

/** Project fuel entries into compact cards for a future mobile review sheet. */
export function toMobileFuelReviewCards(entries: FuelEntry[]): MobileFuelReviewCard[] {
  return (entries || []).map((e) => {
    const day = String(e.date || '').slice(0, 10);
    const liters = e.liters != null ? `${Number(e.liters).toFixed(1)} L` : '—';
    const station = e.location || e.vendor || e.metadata?.stationName || 'Unknown station';
    const source = resolveFuelEntrySource(e);
    return {
      id: e.id,
      title: `${day} · ${liters}`,
      subtitle: `${station} · ${source}`,
      amount: formatFuelMoney(e.amount ?? 0),
      status: entryStatus(e),
    };
  });
}
