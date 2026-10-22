/**
 * Operator split of leftover fuel. Default is company.
 * Does not re-enable miscCoverage. A negative variance is never billed.
 */

export type LeftoverBucket = 'variance' | 'unattributedKm' | 'noOdometerFills';

export type LeftoverSplit = {
  mode: 'company' | 'percentage' | 'fixed';
  driverPercent?: number;
  /** JMD per driver per week, capped once across every bucket. */
  driverFixedAmount?: number;
  appliesTo: LeftoverBucket[];
};

export type LeftoverOverride = LeftoverSplit & {
  reason: string;
  by?: string;
  at?: string;
};

export const DEFAULT_LEFTOVER_SPLIT: LeftoverSplit = {
  mode: 'company',
  appliesTo: ['variance', 'unattributedKm', 'noOdometerFills'],
};

export function normalizeLeftoverSplit(raw: Partial<LeftoverSplit> | null | undefined): LeftoverSplit {
  const mode = raw?.mode === 'percentage' || raw?.mode === 'fixed' ? raw.mode : 'company';
  const applies = (raw?.appliesTo || DEFAULT_LEFTOVER_SPLIT.appliesTo).filter(
    (b): b is LeftoverBucket => b === 'variance' || b === 'unattributedKm' || b === 'noOdometerFills',
  );
  return {
    mode,
    driverPercent: Math.max(0, Math.min(100, Number(raw?.driverPercent) || 0)),
    driverFixedAmount: Math.max(0, Number(raw?.driverFixedAmount) || 0),
    appliesTo: applies.length ? applies : [...DEFAULT_LEFTOVER_SPLIT.appliesTo],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const LEFTOVER_BUCKETS: { id: LeftoverBucket; label: string }[] = [
  { id: 'variance', label: 'Fuel that doesn’t match the car’s usual economy' },
  { id: 'unattributedKm', label: 'Kilometres we couldn’t explain' },
  { id: 'noOdometerFills', label: 'Fills logged without an odometer' },
];

function driverOnBucket(amount: number, split: LeftoverSplit, fixedLeft: number): { driver: number; fixedLeft: number } {
  const bucket = Math.max(0, amount);
  if (split.mode === 'company' || !(bucket > 0)) return { driver: 0, fixedLeft };
  if (split.mode === 'percentage') {
    return { driver: round2(bucket * ((split.driverPercent || 0) / 100)), fixedLeft };
  }
  const driver = round2(Math.min(bucket, Math.max(0, fixedLeft)));
  return { driver, fixedLeft: round2(fixedLeft - driver) };
}

export type LeftoverSplitResult = {
  driver: number;
  company: number;
  byBucket: Record<LeftoverBucket, { driver: number; company: number }>;
  /** Why the driver share was forced to 0, when it was. */
  driverBlockedReason?: string;
};

export function splitLeftoverFuel(args: {
  variance: number;
  unattributedKmCost: number;
  noOdometerFillCost: number;
  split?: Partial<LeftoverSplit> | null;
  /** Non-odometer efficiency, missing reference, or degraded inputs. */
  blockDriver?: boolean;
  blockReason?: string;
}): LeftoverSplitResult {
  const split = normalizeLeftoverSplit(args.split);
  const amounts: Record<LeftoverBucket, number> = {
    variance: Number(args.variance) || 0,
    unattributedKm: Math.max(0, Number(args.unattributedKmCost) || 0),
    noOdometerFills: Math.max(0, Number(args.noOdometerFillCost) || 0),
  };
  const byBucket = {
    variance: { driver: 0, company: 0 },
    unattributedKm: { driver: 0, company: 0 },
    noOdometerFills: { driver: 0, company: 0 },
  } as LeftoverSplitResult['byBucket'];

  let driver = 0;
  let company = 0;
  let fixedLeft = split.mode === 'fixed' ? Math.max(0, split.driverFixedAmount || 0) : 0;
  for (const key of ['variance', 'unattributedKm', 'noOdometerFills'] as LeftoverBucket[]) {
    const raw = amounts[key];
    // Negative variance is a saving. Never billed.
    const billable = key === 'variance' ? Math.max(0, raw) : raw;
    const companyHeld = key === 'variance' && raw < 0 ? raw : billable;
    const applies = split.appliesTo.includes(key);
    const share = args.blockDriver || !applies
      ? { driver: 0, fixedLeft }
      : driverOnBucket(billable, split, fixedLeft);
    fixedLeft = share.fixedLeft;
    byBucket[key] = { driver: share.driver, company: round2(companyHeld - share.driver) };
    driver = round2(driver + share.driver);
    company = round2(company + (companyHeld - share.driver));
  }
  return {
    driver,
    company,
    byBucket,
    driverBlockedReason: args.blockDriver ? (args.blockReason || 'degraded') : undefined,
  };
}
