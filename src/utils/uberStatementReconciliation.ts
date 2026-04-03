import type { Trip } from '../types/data';
import type { UberSsotTotals } from './uberSsot';

export const DEFAULT_NET_FARE_RECON_TOLERANCE = 0.02;

function ymd(iso: string | undefined): string {
  if (!iso || typeof iso !== 'string') return '';
  const s = iso.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function tripYmd(t: Trip): string {
  return ymd(t.date as string);
}

function isUberCompleted(t: Trip): boolean {
  return (
    String(t.platform ?? '').toLowerCase() === 'uber' &&
    String(t.status ?? '').toLowerCase() === 'completed'
  );
}

/** Matches import preview: sum of `uberFareComponents` on merged trips (fare-only, ex tips). */
export function sumUberTripRollFareComponents(
  trips: Trip[],
  driverId: string,
  periodStartYmd: string,
  periodEndYmd: string,
): number {
  const dNorm = driverId.trim().toLowerCase();
  if (!dNorm || !periodStartYmd || !periodEndYmd) return 0;
  let sum = 0;
  for (const t of trips) {
    if (!isUberCompleted(t)) continue;
    if (String(t.driverId || '').trim().toLowerCase() !== dNorm) continue;
    const d = tripYmd(t);
    if (!d || d < periodStartYmd || d > periodEndYmd) continue;
    sum += Number(t.uberFareComponents) || 0;
  }
  return sum;
}

export interface DriverNetFareVariance {
  driverId: string;
  statementNetFare: number;
  tripRollFareComponents: number;
  delta: number;
  withinTolerance: boolean;
}

/**
 * Per-driver: Uber statement `statementNetFare` vs sum of trip `uberFareComponents` in period.
 * Empty when there is no per-driver SSOT map.
 */
export function reconcileUberNetFareByDriver(params: {
  trips: Trip[];
  uberStatementsByDriverId: Record<string, UberSsotTotals> | null | undefined;
  periodStartYmd: string;
  periodEndYmd: string;
  tolerance?: number;
}): DriverNetFareVariance[] {
  const tol = params.tolerance ?? DEFAULT_NET_FARE_RECON_TOLERANCE;
  const map = params.uberStatementsByDriverId;
  if (!map || Object.keys(map).length === 0) return [];

  const ps = params.periodStartYmd;
  const pe = params.periodEndYmd;
  const out: DriverNetFareVariance[] = [];

  const drivers = Object.keys(map).sort((a, b) => a.localeCompare(b));
  for (const driverId of drivers) {
    const statementNetFare = Number(map[driverId]?.statementNetFare) || 0;
    const tripRoll = sumUberTripRollFareComponents(params.trips, driverId, ps, pe);
    const delta = statementNetFare - tripRoll;
    out.push({
      driverId,
      statementNetFare,
      tripRollFareComponents: tripRoll,
      delta,
      withinTolerance: Math.abs(delta) <= tol,
    });
  }
  return out;
}
