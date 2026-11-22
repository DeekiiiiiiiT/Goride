/**
 * F-13: week km/L vs car reference and KmLTracking-style bands.
 */

export type EconomyBand = 'normal' | 'watch' | 'flagged';

export type WeekEconomyRow = {
  weekStart: string;
  kmPerLiter: number | null;
  referenceKmPerLiter: number | null;
  pctVsUsual: number | null;
  band: EconomyBand | null;
};

const WATCH_WORSE_PCT = 0.15;
const FLAGGED_WORSE_PCT = 0.3;
const DRIFT_ALERT_WEEKS = 3;
const DRIFT_BAND_PCT = 0.15;

export function worseVariancePct(actual: number, reference: number): number {
  if (!(reference > 0) || !(actual > 0)) return 0;
  return (reference - actual) / reference;
}

export function economyBand(actual: number, reference: number): EconomyBand {
  const worse = worseVariancePct(actual, reference);
  if (worse > FLAGGED_WORSE_PCT) return 'flagged';
  if (worse > WATCH_WORSE_PCT) return 'watch';
  return 'normal';
}

export function pctDifference(actual: number, reference: number): number {
  if (!(reference > 0) || !(actual > 0)) return 0;
  return ((actual - reference) / reference) * 100;
}

export function buildWeekEconomyRows(input: {
  weeks: Array<{ weekStart: string; kmPerLiter: number | null }>;
  referenceKmPerLiter: number | null;
}): WeekEconomyRow[] {
  const ref = input.referenceKmPerLiter;
  return input.weeks.map((w) => {
    const kmL = w.kmPerLiter;
    if (kmL == null || !(kmL > 0) || ref == null || !(ref > 0)) {
      return {
        weekStart: w.weekStart,
        kmPerLiter: kmL,
        referenceKmPerLiter: ref,
        pctVsUsual: null,
        band: null,
      };
    }
    return {
      weekStart: w.weekStart,
      kmPerLiter: kmL,
      referenceKmPerLiter: ref,
      pctVsUsual: pctDifference(kmL, ref),
      band: economyBand(kmL, ref),
    };
  });
}

/** Outside ±15% of usual for 3 consecutive weeks with data → economy_drift alert. */
export function economyDriftThreeWeeksRunning(rows: WeekEconomyRow[]): boolean {
  const usable = rows.filter(
    (r) =>
      r.kmPerLiter != null &&
      r.referenceKmPerLiter != null &&
      r.pctVsUsual != null,
  );
  if (usable.length < DRIFT_ALERT_WEEKS) return false;
  const tail = usable.slice(-DRIFT_ALERT_WEEKS);
  return tail.every((r) => Math.abs((r.pctVsUsual ?? 0) / 100) > DRIFT_BAND_PCT);
}