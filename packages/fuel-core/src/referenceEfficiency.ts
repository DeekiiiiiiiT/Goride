/**
 * Reference km/L from earlier fills only. The current week is not in the
 * sample, so unexplained litres can exist. The caller passes a trailing
 * 8-week window. Every fill in that window is the default. Full-to-full
 * is used only when four fills are flagged full and their tank use is
 * between 80% and 110%. Needs ≥ 3 weeks or ≥ 1,500 km. Otherwise the
 * week is degraded and variance is 0.
 */

export const REFERENCE_MIN_WEEKS = 3;
export const REFERENCE_MIN_KM = 1500;
export const REFERENCE_LOOKBACK_DAYS = 56;
export const FULL_TANK_MIN_COUNT = 4;
export const FULL_TANK_USE_MIN = 80;
export const FULL_TANK_USE_MAX = 110;
export const VARIANCE_MATERIALITY_PCT = 10;
/** A car cannot honestly sit outside this band. Outside it, do not price the week. */
export const REFERENCE_KM_PER_L_MIN = 4;
export const REFERENCE_KM_PER_L_MAX = 40;

export type ReferenceFill = {
  date: string;
  odometer?: number | null;
  liters?: number | null;
  fullTank?: boolean;
  /** Tank use percent. Missing means a full-tank flag is not trustworthy. */
  tankUsePct?: number | null;
  /** Left out only when the litres themselves are not real. */
  exclude?: boolean;
};

export type ReferenceEfficiency = {
  kmPerLiter: number | null;
  degraded: boolean;
  spanKm: number;
  liters: number;
  weeks: number;
  reason: string;
};

function ymd(d: string): string {
  return String(d || '').slice(0, 10);
}

function weekKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

export function referenceEfficiencyFromFills(
  fills: ReferenceFill[],
  weekStartYmd: string,
): ReferenceEfficiency {
  const prior = fills
    .filter((f) => !f.exclude && ymd(f.date) && ymd(f.date) < weekStartYmd)
    .filter((f) => Number(f.odometer) > 0 && Number(f.liters) > 0)
    .sort((a, b) => Number(a.odometer) - Number(b.odometer));

  const empty: ReferenceEfficiency = {
    kmPerLiter: null,
    degraded: true,
    spanKm: 0,
    liters: 0,
    weeks: 0,
    reason: 'no_prior_chain',
  };
  if (prior.length < 2) return empty;

  const full = prior.filter((f) => {
    if (!f.fullTank) return false;
    const use = Number(f.tankUsePct);
    return Number.isFinite(use) && use >= FULL_TANK_USE_MIN && use <= FULL_TANK_USE_MAX;
  });
  let spanKm = 0;
  let liters = 0;
  let weeks = 0;
  let reason = 'fill_chain';
  if (full.length >= FULL_TANK_MIN_COUNT) {
    const firstOdo = Number(full[0].odometer);
    const lastOdo = Number(full[full.length - 1].odometer);
    // Full-to-full: the fuel already in the tank at the first full fill is not counted.
    // Every litre after that fill, through and including the last full fill, is.
    spanKm = lastOdo - firstOdo;
    liters = prior
      .filter((f) => {
        const odo = Number(f.odometer);
        return odo > firstOdo && odo <= lastOdo;
      })
      .reduce((s, f) => s + (Number(f.liters) || 0), 0);
    weeks = new Set(
      prior
        .filter((f) => {
          const odo = Number(f.odometer);
          return odo >= firstOdo && odo <= lastOdo;
        })
        .map((f) => weekKey(ymd(f.date))),
    ).size;
    reason = 'full_tank_chain';
  } else {
    const sample = prior;
    spanKm = Number(sample[sample.length - 1].odometer) - Number(sample[0].odometer);
    liters = sample.slice(1).reduce((s, f) => s + (Number(f.liters) || 0), 0);
    weeks = new Set(sample.map((f) => weekKey(ymd(f.date)))).size;
  }
  if (!(spanKm > 0) || !(liters > 0)) return empty;
  if (weeks < REFERENCE_MIN_WEEKS && spanKm < REFERENCE_MIN_KM) {
    return {
      kmPerLiter: null,
      degraded: true,
      spanKm,
      liters,
      weeks,
      reason: 'reference_too_short',
    };
  }
  const kmPerLiter = spanKm / liters;
  if (kmPerLiter < REFERENCE_KM_PER_L_MIN || kmPerLiter > REFERENCE_KM_PER_L_MAX) {
    return {
      kmPerLiter: null,
      degraded: true,
      spanKm,
      liters,
      weeks,
      reason: 'reference_out_of_band',
    };
  }
  return {
    kmPerLiter,
    degraded: false,
    spanKm,
    liters,
    weeks,
    reason,
  };
}

/** Positive = unexplained litres. Negative = over-explained (never billed). */
export function litreVariance(args: {
  spanKm: number;
  actualLiters: number;
  referenceKmPerLiter: number | null;
}): { liters: number; material: boolean; pct: number } {
  const ref = Number(args.referenceKmPerLiter) || 0;
  const actual = Number(args.actualLiters) || 0;
  const span = Number(args.spanKm) || 0;
  if (!(ref > 0) || !(actual > 0)) return { liters: 0, material: false, pct: 0 };
  const expected = span / ref;
  const liters = actual - expected;
  const pct = (liters / actual) * 100;
  return { liters, pct, material: Math.abs(pct) >= VARIANCE_MATERIALITY_PCT };
}
