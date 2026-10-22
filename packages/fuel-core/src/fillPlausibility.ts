/**
 * Per-fill plausibility. Hard failures cannot be saved.
 * Soft failures can be saved only with an explicit confirm, and they
 * block week close until accepted.
 */

export const PRICE_BAND_PCT = 15;

export type FillPlausibilityInput = {
  id?: string;
  amount: number;
  liters: number;
  odometer?: number | null;
  /** Latest odometer already on the vehicle, if known. */
  previousOdometer?: number | null;
  tankCapacityLiters?: number | null;
  /** Other fills' prices (amount/liters) used as the week median. */
  peerPrices?: number[];
  /** Another fill already uses this odometer. */
  duplicateOdometer?: boolean;
  confirmed?: boolean;
};

export type FillPlausibilityIssue = {
  code:
    | 'zero_liters_with_amount'
    | 'odometer_backwards'
    | 'over_tank'
    | 'price_off_median'
    | 'duplicate_odometer'
    | 'tank_unknown';
  severity: 'block' | 'confirm' | 'warn';
  message: string;
};

function median(values: number[]): number | null {
  const xs = values.filter((n) => n > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function assessFillPlausibility(input: FillPlausibilityInput): FillPlausibilityIssue[] {
  const issues: FillPlausibilityIssue[] = [];
  const amount = Number(input.amount) || 0;
  const liters = Number(input.liters) || 0;
  const odo = Number(input.odometer) || 0;
  const prev = Number(input.previousOdometer) || 0;
  const tank = Number(input.tankCapacityLiters) || 0;

  if (amount > 0 && !(liters > 0)) {
    issues.push({
      code: 'zero_liters_with_amount',
      severity: 'block',
      message: 'This fill has money but no litres.',
    });
  }
  if (odo > 0 && prev > 0 && odo < prev) {
    issues.push({
      code: 'odometer_backwards',
      severity: 'block',
      message: 'Odometer is lower than the previous reading.',
    });
  }
  if (tank > 0 && liters > tank) {
    issues.push({
      code: 'over_tank',
      severity: 'block',
      message: `Litres are above the ${tank} L tank.`,
    });
  } else if (!(tank > 0) && liters > 0) {
    issues.push({
      code: 'tank_unknown',
      severity: 'warn',
      message: 'Tank size is not set, so litres were not checked against the tank.',
    });
  }
  if (liters > 0 && amount > 0) {
    const price = amount / liters;
    const mid = median(input.peerPrices || []);
    if (mid && mid > 0 && Math.abs(price - mid) / mid > PRICE_BAND_PCT / 100) {
      issues.push({
        code: 'price_off_median',
        severity: 'confirm',
        message: `Price is more than ${PRICE_BAND_PCT}% off the week’s typical price.`,
      });
    }
  }
  if (input.duplicateOdometer) {
    issues.push({
      code: 'duplicate_odometer',
      severity: 'confirm',
      message: 'Another fill already uses this odometer.',
    });
  }
  if (input.confirmed) {
    return issues.filter((i) => i.severity === 'block' || i.severity === 'warn');
  }
  return issues;
}

export function fillPlausibilityBlocksSave(issues: FillPlausibilityIssue[]): boolean {
  return issues.some((i) => i.severity === 'block' || i.severity === 'confirm');
}

type WeekFill = {
  id?: string;
  vehicleId?: string;
  amount?: number;
  liters?: number;
  odometer?: number | null;
  metadata?: { plausibilityAccepted?: boolean } | null;
};

/** True when a hard or confirm-level issue has not been explicitly accepted. */
export function weekHasUnreviewedImplausibleFills(entries: WeekFill[]): boolean {
  const byVehicle = new Map<string, WeekFill[]>();
  for (const entry of entries) {
    const id = String(entry.vehicleId || '');
    const list = byVehicle.get(id) || [];
    list.push(entry);
    byVehicle.set(id, list);
  }
  for (const list of byVehicle.values()) {
    const prices = list
      .filter((e) => Number(e.liters) > 0 && Number(e.amount) > 0)
      .map((e) => Number(e.amount) / Number(e.liters));
    const seen = new Set<number>();
    for (const entry of list) {
      if (entry.metadata?.plausibilityAccepted) continue;
      const odo = Number(entry.odometer) || 0;
      const duplicate = odo > 0 && seen.has(odo);
      if (odo > 0) seen.add(odo);
      const peers = prices.filter((p) => {
        const own = Number(entry.liters) > 0 ? Number(entry.amount) / Number(entry.liters) : 0;
        return p !== own;
      });
      const issues = assessFillPlausibility({
        amount: Number(entry.amount) || 0,
        liters: Number(entry.liters) || 0,
        odometer: entry.odometer,
        duplicateOdometer: duplicate,
        peerPrices: peers,
      });
      if (issues.some((i) => i.severity === 'block' || i.severity === 'confirm')) return true;
    }
  }
  return false;
}
