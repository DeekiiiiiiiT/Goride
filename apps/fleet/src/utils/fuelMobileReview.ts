/**
 * Phase 5 — mobile-oriented review helpers for on-the-road approvals.
 * Keeps a compact summary shape the mobile sheet can render.
 */
import type { FuelEntry } from '../types/fuel';
import { formatFuelMoney } from './formatFuelMoney';

export type MobileFuelReviewCard = {
  id: string;
  title: string;
  subtitle: string;
  amountLabel: string;
  needsAttention: boolean;
};

export function toMobileFuelReviewCards(entries: FuelEntry[]): MobileFuelReviewCard[] {
  return entries.map((e) => ({
    id: e.id,
    title: e.location || e.vendor || 'Fuel fill',
    subtitle: `${String(e.date || '').slice(0, 10)} · ${(e.liters ?? 0).toFixed(1)} L`,
    amountLabel: formatFuelMoney(e.amount ?? 0),
    needsAttention:
      e.isFlagged === true ||
      e.reconciliationStatus === 'Flagged' ||
      e.locationStatus === 'review_required' ||
      e.locationStatus === 'unknown',
  }));
}
