/**
 * Reference km/L from earlier fills only. The current week is not in the
 * sample, so unexplained litres can exist. Prefer full-tank fills.
 * Needs ≥ 3 weeks or ≥ 1,500 km. Otherwise the week is degraded and variance is 0.
 */

export const REFERENCE_MIN_WEEKS = 3;
export const REFERENCE_MIN_KM = 1500;
export const VARIANCE_MATERIALITY_PCT = 10;

export type ReferenceFill = {
  date: string;
  odometer?: number | null;
  liters?: number | null;
  fullTank?: boolean;
  /** Excluded from the reference (implausible). */
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

  const full = prior.filter((f) => f.fullTank);
  const sample = full.length >= 2 ? full : prior;
  const spanKm = Number(sample[sample.length - 1].odometer) - Number(sample[0].odometer);
  const liters = sample.slice(1).reduce((s, f) => s + (Number(f.liters) || 0), 0);
  const weeks = new Set(sample.map((f) => weekKey(ymd(f.date)))).size;
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
  return {
    kmPerLiter: spanKm / liters,
    degraded: false,
    spanKm,
    liters,
    weeks,
    reason: full.length >= 2 ? 'full_tank_chain' : 'fill_chain',
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
