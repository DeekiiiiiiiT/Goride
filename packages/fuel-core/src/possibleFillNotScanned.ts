/**
 * F-08: flag fill-to-fill stretches longer than 1.2 × the car's p90 over the prior 8 weeks.
 */

export type FillAnchor = {
  id?: string;
  date: string;
  odometer: number;
  /** Card fill waiting for statement — still splits stretches. */
  awaitingCardStatement?: boolean;
};

export type PossibleFillNotScannedFlag = {
  flagCode: 'possible_fill_not_scanned';
  vehicleId: string;
  startDate: string;
  endDate: string;
  startOdometer: number;
  endOdometer: number;
  stretchKm: number;
  p90Km: number;
  thresholdKm: number;
  entryId: string;
};

const MIN_PRIOR_STRETCHES = 10;
const LOOKBACK_WEEKS = 8;
const STRETCH_MULTIPLIER = 1.2;

function ymd(d: string): string {
  return String(d || '').split('T')[0];
}

function daysBetween(a: string, b: string): number {
  const da = new Date(ymd(a));
  const db = new Date(ymd(b));
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 9999;
  return Math.abs(db.getTime() - da.getTime()) / 86_400_000;
}

export function percentile90(values: number[]): number | null {
  const xs = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  const rank = 0.9 * (xs.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (rank - lo);
}

export function fillCountsAsAnchor(f: FillAnchor): boolean {
  return Number.isFinite(f.odometer) && f.odometer > 0;
}

export function buildFillToFillStretches(anchors: FillAnchor[]): Array<{
  from: FillAnchor;
  to: FillAnchor;
  km: number;
}> {
  const sorted = [...anchors]
    .filter(fillCountsAsAnchor)
    .sort((a, b) => {
      const dc = ymd(a.date).localeCompare(ymd(b.date));
      if (dc !== 0) return dc;
      return a.odometer - b.odometer;
    });
  const out: Array<{ from: FillAnchor; to: FillAnchor; km: number }> = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1];
    const to = sorted[i];
    const km = to.odometer - from.odometer;
    if (km > 0) out.push({ from, to, km });
  }
  return out;
}

export function priorStretchPool(
  stretches: Array<{ from: FillAnchor; to: FillAnchor; km: number }>,
  beforeDate: string,
  lookbackWeeks = LOOKBACK_WEEKS,
): number[] {
  const cutoff = beforeDate;
  return stretches
    .filter((s) => ymd(s.to.date) < ymd(cutoff))
  .filter((s) => daysBetween(s.to.date, cutoff) <= lookbackWeeks * 7 + 1)
    .map((s) => s.km);
}

export function detectPossibleFillNotScannedFlags(input: {
  vehicleId: string;
  anchors: FillAnchor[];
  weekStart?: string;
  weekEnd?: string;
}): PossibleFillNotScannedFlag[] {
  const stretches = buildFillToFillStretches(input.anchors);
  const flags: PossibleFillNotScannedFlag[] = [];

  for (const s of stretches) {
    const prior = priorStretchPool(stretches, s.from.date);
    if (prior.length < MIN_PRIOR_STRETCHES) continue;
    const p90 = percentile90(prior);
    if (p90 == null) continue;
    const threshold = p90 * STRETCH_MULTIPLIER;
    if (s.km <= threshold) continue;

    if (input.weekStart && input.weekEnd) {
      const endInWeek =
        ymd(s.to.date) >= ymd(input.weekStart) && ymd(s.to.date) <= ymd(input.weekEnd);
      const spanInWeek =
        ymd(s.from.date) <= ymd(input.weekEnd) && ymd(s.to.date) >= ymd(input.weekStart);
      if (!endInWeek && !spanInWeek) continue;
    }

    const entryId = `stretch:${input.vehicleId}:${ymd(s.from.date)}:${ymd(s.to.date)}`;
    flags.push({
      flagCode: 'possible_fill_not_scanned',
      vehicleId: input.vehicleId,
      startDate: ymd(s.from.date),
      endDate: ymd(s.to.date),
      startOdometer: s.from.odometer,
      endOdometer: s.to.odometer,
      stretchKm: s.km,
      p90Km: p90,
      thresholdKm: threshold,
      entryId,
    });
  }
  return flags;
}