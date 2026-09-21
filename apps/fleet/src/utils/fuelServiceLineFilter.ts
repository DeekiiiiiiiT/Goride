/** Fuel Management service-line lens (URL ?line=). Canonical backend: rideshare | rush_delivery. */

import { fuelServiceLineUiLabel } from './fuelServiceLineLabels';

export type FuelLineTab = 'all' | 'rideshare' | 'delivery';

/** Filter values sent to API / matched against FuelEntry.serviceLine */
export type FuelServiceLineFilter = 'all' | 'rideshare' | 'rush_delivery' | 'unattributed';

export function fuelLineTabToApi(line: FuelLineTab): FuelServiceLineFilter {
  if (line === 'delivery') return 'rush_delivery';
  if (line === 'rideshare') return 'rideshare';
  return 'all';
}

export function fuelLineTabLabel(line: FuelLineTab): string {
  return fuelServiceLineUiLabel(line);
}

export function entryServiceLine(
  entry: { serviceLine?: string | null; service_line?: string | null },
): 'rideshare' | 'rush_delivery' | null {
  const raw = entry.serviceLine ?? entry.service_line;
  if (raw === 'rideshare' || raw === 'rush_delivery') return raw;
  return null;
}

export function entryServiceLineSource(
  entry: { serviceLineSource?: string | null; service_line_source?: string | null },
): string | null {
  const raw = entry.serviceLineSource ?? entry.service_line_source;
  return raw ? String(raw) : null;
}

/** True when row belongs in the Unattributed bucket. */
export function isUnattributedFuelEntry(entry: {
  serviceLine?: string | null;
  service_line?: string | null;
  serviceLineSource?: string | null;
  service_line_source?: string | null;
}): boolean {
  const src = entryServiceLineSource(entry);
  if (src === 'unattributed') return true;
  return entryServiceLine(entry) == null;
}

export function fuelEntryMatchesLineFilter(
  entry: {
    serviceLine?: string | null;
    service_line?: string | null;
    serviceLineSource?: string | null;
    service_line_source?: string | null;
  },
  filter: FuelServiceLineFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'unattributed') return isUnattributedFuelEntry(entry);
  // Unattributed source is authoritative — never double-count into a line tab (S2).
  if (isUnattributedFuelEntry(entry)) return false;
  const line = entryServiceLine(entry);
  if (filter === 'rideshare') return line === 'rideshare';
  if (filter === 'rush_delivery') return line === 'rush_delivery';
  return true;
}

export type FuelLineConservation = {
  allCount: number;
  rideshareCount: number;
  deliveryCount: number;
  unattributedCount: number;
  allSpend: number;
  rideshareSpend: number;
  deliverySpend: number;
  unattributedSpend: number;
};

type ConservationEntry = {
  amount?: number;
  serviceLine?: string | null;
  service_line?: string | null;
  serviceLineSource?: string | null;
  service_line_source?: string | null;
};

/**
 * Partition with the same predicates the UI tabs use.
 * allSpend is independent of bucket sums so conservationHolds can fail (S1).
 */
export function computeFuelLineConservation(entries: ConservationEntry[]): FuelLineConservation {
  let rideshareCount = 0;
  let deliveryCount = 0;
  let unattributedCount = 0;
  let rideshareSpend = 0;
  let deliverySpend = 0;
  let unattributedSpend = 0;
  let allSpend = 0;
  for (const e of entries) {
    const amt = Number(e.amount) || 0;
    allSpend += amt;
    if (isUnattributedFuelEntry(e)) {
      unattributedCount++;
      unattributedSpend += amt;
    } else if (fuelEntryMatchesLineFilter(e, 'rush_delivery')) {
      deliveryCount++;
      deliverySpend += amt;
    } else if (fuelEntryMatchesLineFilter(e, 'rideshare')) {
      rideshareCount++;
      rideshareSpend += amt;
    }
    // Leftover rows leave conservationHolds false (should be impossible after S2).
  }
  return {
    allCount: entries.length,
    rideshareCount,
    deliveryCount,
    unattributedCount,
    allSpend,
    rideshareSpend,
    deliverySpend,
    unattributedSpend,
  };
}

export function conservationHolds(c: FuelLineConservation, eps = 0.01): boolean {
  const countOk =
    c.rideshareCount + c.deliveryCount + c.unattributedCount === c.allCount;
  const spendOk = Math.abs(c.rideshareSpend + c.deliverySpend + c.unattributedSpend - c.allSpend) < eps;
  return countOk && spendOk;
}

export function serviceLineSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'program':
      return 'from program';
    case 'explicit':
      return 'set manually';
    case 'trip':
      return 'from trip';
    case 'vehicle':
      return 'from vehicle';
    case 'driver':
      return 'from driver';
    case 'unattributed':
      return 'unattributed';
    default:
      return source ? String(source) : 'unknown';
  }
}
