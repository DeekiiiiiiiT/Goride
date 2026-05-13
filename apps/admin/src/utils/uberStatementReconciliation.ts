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

function normId(id: string | undefined): string {
  return String(id || '')
    .trim()
    .toLowerCase();
}

function isUberCompleted(t: Trip): boolean {
  return (
    String(t.platform ?? '').toLowerCase() === 'uber' &&
    String(t.status ?? '').toLowerCase() === 'completed'
  );
}

/** Per-trip fare component for rollups: prefer `uberFareComponents`, else approximate from net amount minus tip/prior. */
function tripFareComponentForRoll(t: Trip): number {
  const fc = Number(t.uberFareComponents);
  if (Number.isFinite(fc) && Math.abs(fc) > 1e-9) return fc;
  const amt = Math.abs(Number(t.amount) || 0);
  const tips = Number(t.uberTips) || 0;
  const prior = Number(t.uberPriorPeriodAdjustment) || 0;
  const x = amt - tips - prior;
  return x > 0 ? x : 0;
}

/**
 * Sum of fare components for Uber completed trips in [periodStartYmd, periodEndYmd], grouped by driver id.
 */
export function aggregateUberTripFareRollByDriver(
  trips: Trip[],
  periodStartYmd: string,
  periodEndYmd: string,
): Map<string, number> {
  const by = new Map<string, number>();
  if (!periodStartYmd || !periodEndYmd) return by;
  for (const t of trips) {
    if (!isUberCompleted(t)) continue;
    const d = tripYmd(t);
    if (!d || d < periodStartYmd || d > periodEndYmd) continue;
    const id = normId(t.driverId);
    if (!id) continue;
    const add = tripFareComponentForRoll(t);
    by.set(id, (by.get(id) || 0) + add);
  }
  return by;
}

/** SSOT drivers with material statement net fare (for single-earner fallback). */
function ssotEarningDriverKeys(map: Record<string, UberSsotTotals>): string[] {
  return Object.keys(map).filter((k) => Math.abs(map[k]?.statementNetFare || 0) > 0.01);
}

/** Matches import preview: sum of fare components on merged trips (fare-only), with single-earner fallback. */
export function sumUberTripRollFareComponents(
  trips: Trip[],
  driverId: string,
  periodStartYmd: string,
  periodEndYmd: string,
  ssotMap?: Record<string, UberSsotTotals> | null,
): number {
  const dNorm = normId(driverId);
  if (!dNorm || !periodStartYmd || !periodEndYmd) return 0;

  const byDriver = aggregateUberTripFareRollByDriver(trips, periodStartYmd, periodEndYmd);
  let sum = byDriver.get(dNorm) || 0;
  if (sum > 1e-6) return sum;

  const earners = ssotMap ? ssotEarningDriverKeys(ssotMap) : [];
  if (
    ssotMap &&
    earners.length === 1 &&
    earners[0].toLowerCase() === dNorm &&
    byDriver.size === 1
  ) {
    const only = [...byDriver.values()][0];
    if (only > 1e-6) return only;
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
    const tripRoll = sumUberTripRollFareComponents(params.trips, driverId, ps, pe, map);

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
