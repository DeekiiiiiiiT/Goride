/**
 * Ride Share / Deadhead dollar attribution by rideshare platform (Roam / Uber / InDrive).
 * Ride Share uses each platform's trip km share of that week's rideshare km.
 * Deadhead is not platform-tagged — we allocate Deadhead $ in the same km proportions
 * so operators see which book of trips is “carrying” repositioning cost.
 */

import type { Trip } from '../types/data';
import { getTotalTripRideshareKm } from './tripRideshareKm';
import { normalizePlatform } from './normalizePlatform';
import { isEntryInInclusiveYmdRange } from './fuelWeekPeriod';

export type RideshareInsightPlatform = 'Roam' | 'Uber' | 'InDrive' | 'Other';

export const RIDESHARE_INSIGHT_PLATFORMS: RideshareInsightPlatform[] = [
  'Roam',
  'Uber',
  'InDrive',
  'Other',
];

export type PlatformAmountMap = Record<RideshareInsightPlatform, number>;

export function emptyPlatformAmounts(): PlatformAmountMap {
  return { Roam: 0, Uber: 0, InDrive: 0, Other: 0 };
}

export function toInsightPlatform(platform: string | undefined | null): RideshareInsightPlatform {
  const n = normalizePlatform(platform);
  if (n === 'Roam' || n === 'Uber' || n === 'InDrive') return n;
  return 'Other';
}

/** Sum full-stack rideshare km by platform for Completed/Cancelled trips in a YMD window. */
export function sumTripKmByPlatform(
  trips: Trip[],
  opts: { weekStart: string; weekEnd: string; driverId?: string; vehicleId?: string },
): PlatformAmountMap {
  const out = emptyPlatformAmounts();
  for (const t of trips) {
    if (!(t.status === 'Completed' || t.status === 'Cancelled')) continue;
    if (!isEntryInInclusiveYmdRange(t.date, opts.weekStart, opts.weekEnd)) continue;
    if (opts.driverId && t.driverId && t.driverId !== opts.driverId) continue;
    if (opts.vehicleId && t.vehicleId && t.vehicleId !== opts.vehicleId) continue;
    const km = getTotalTripRideshareKm(t);
    if (km <= 0) continue;
    out[toInsightPlatform(t.platform)] += km;
  }
  return out;
}

/** Split a dollar amount across platforms by km weights (zero weights → all zero). */
export function allocateAmountByKmShare(
  totalAmount: number,
  kmByPlatform: PlatformAmountMap,
): PlatformAmountMap {
  const out = emptyPlatformAmounts();
  const kmTotal =
    kmByPlatform.Roam + kmByPlatform.Uber + kmByPlatform.InDrive + kmByPlatform.Other;
  if (!(totalAmount > 0) || !(kmTotal > 0)) return out;

  let allocated = 0;
  const keys = RIDESHARE_INSIGHT_PLATFORMS;
  keys.forEach((key, i) => {
    if (i === keys.length - 1) {
      out[key] = Number((totalAmount - allocated).toFixed(2));
      return;
    }
    const share = kmByPlatform[key] / kmTotal;
    const piece = Number((totalAmount * share).toFixed(2));
    out[key] = piece;
    allocated += piece;
  });
  return out;
}

export function addPlatformAmounts(a: PlatformAmountMap, b: PlatformAmountMap): PlatformAmountMap {
  return {
    Roam: a.Roam + b.Roam,
    Uber: a.Uber + b.Uber,
    InDrive: a.InDrive + b.InDrive,
    Other: a.Other + b.Other,
  };
}

export function platformAmountsTotal(m: PlatformAmountMap): number {
  return m.Roam + m.Uber + m.InDrive + m.Other;
}
