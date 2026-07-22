/**
 * Jamaica vehicle fitness fee + validity matrix (Island Traffic Authority structure).
 * Used by Expense Hub Fitness permit rules to bucket fleet vehicles.
 */

export type FitnessUsageCategory =
  | 'Private'
  | 'Motorcycle'
  | 'Commercial'
  | 'PPV'
  | 'Trailer';

export type FitnessPlateClass = 'White' | 'Green' | 'Red';

export type FitnessValidityYears = 1 | 3 | 5;

export type FitnessTierId =
  | 'private_new'
  | 'private_mid'
  | 'private_old'
  | 'motorcycle'
  | 'commercial_new'
  | 'commercial_used'
  | 'ppv'
  | 'trailer';

export type FitnessTier = {
  id: FitnessTierId;
  label: string;
  usageCategory: FitnessUsageCategory;
  plateClass: FitnessPlateClass;
  fee: number;
  validityYears: FitnessValidityYears;
};

export const FITNESS_TIERS: readonly FitnessTier[] = [
  {
    id: 'private_new',
    label: 'Private — brand new (0–2 yrs, under 250 km)',
    usageCategory: 'Private',
    plateClass: 'White',
    fee: 4500,
    validityYears: 5,
  },
  {
    id: 'private_mid',
    label: 'Private — mid-age (up to 10 yrs)',
    usageCategory: 'Private',
    plateClass: 'White',
    fee: 4500,
    validityYears: 3,
  },
  {
    id: 'private_old',
    label: 'Private — older (over 10 yrs)',
    usageCategory: 'Private',
    plateClass: 'White',
    fee: 4500,
    validityYears: 1,
  },
  {
    id: 'motorcycle',
    label: 'Motorcycle — all ages',
    usageCategory: 'Motorcycle',
    plateClass: 'White',
    fee: 4500,
    validityYears: 1,
  },
  {
    id: 'commercial_new',
    label: 'Commercial — first registration',
    usageCategory: 'Commercial',
    plateClass: 'Green',
    fee: 4500,
    validityYears: 3,
  },
  {
    id: 'commercial_used',
    label: 'Commercial — used (under 10 yrs)',
    usageCategory: 'Commercial',
    plateClass: 'Green',
    fee: 4500,
    validityYears: 1,
  },
  {
    id: 'ppv',
    label: 'Public passenger (PPV)',
    usageCategory: 'PPV',
    plateClass: 'Red',
    fee: 5400,
    validityYears: 1,
  },
  {
    id: 'trailer',
    label: 'Trailers & heavy tractors',
    usageCategory: 'Trailer',
    plateClass: 'Green',
    fee: 5400,
    validityYears: 1,
  },
] as const;

export type FitnessClassifyInput = {
  usageCategory?: FitnessUsageCategory | string | null;
  plateClass?: FitnessPlateClass | string | null;
  /** Model / manufacture year (e.g. "2018"). */
  year?: string | number | null;
  /** Current odometer km — used for brand-new private under 250 km. */
  odometerKm?: number | null;
  /**
   * When true, treat commercial as first registration (brand new).
   * When false/undefined for Commercial under 10 yrs → used commercial.
   */
  firstRegistration?: boolean | null;
  /** Reference date for age calc (defaults to today). */
  asOf?: Date;
};

export function vehicleAgeYears(
  year: string | number | null | undefined,
  asOf: Date = new Date(),
): number | null {
  const y = Number(String(year ?? '').trim());
  if (!Number.isFinite(y) || y < 1900 || y > asOf.getFullYear() + 1) return null;
  return Math.max(0, asOf.getFullYear() - y);
}

export function getFitnessTier(id: FitnessTierId): FitnessTier {
  const tier = FITNESS_TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown fitness tier: ${id}`);
  return tier;
}

/** Resolve Jamaica fitness fee + validity for a vehicle profile. */
export function classifyFitnessTier(input: FitnessClassifyInput): FitnessTier | null {
  const usage = String(input.usageCategory || '').trim() as FitnessUsageCategory;
  const plate = String(input.plateClass || '').trim() as FitnessPlateClass;
  if (!usage || !plate) return null;

  const age = vehicleAgeYears(input.year, input.asOf ?? new Date());
  const odo =
    input.odometerKm == null || !Number.isFinite(Number(input.odometerKm))
      ? null
      : Number(input.odometerKm);

  if (usage === 'Motorcycle') {
    if (plate !== 'White') return null;
    return getFitnessTier('motorcycle');
  }

  if (usage === 'PPV') {
    if (plate !== 'Red') return null;
    return getFitnessTier('ppv');
  }

  if (usage === 'Trailer') {
    if (plate !== 'Green') return null;
    return getFitnessTier('trailer');
  }

  if (usage === 'Private') {
    if (plate !== 'White') return null;
    if (age == null) return null;
    if (age <= 2 && (odo == null || odo < 250)) return getFitnessTier('private_new');
    if (age <= 10) return getFitnessTier('private_mid');
    return getFitnessTier('private_old');
  }

  if (usage === 'Commercial') {
    if (plate !== 'Green') return null;
    if (input.firstRegistration === true) return getFitnessTier('commercial_new');
    if (age == null) return null;
    if (age < 10) return getFitnessTier('commercial_used');
    // Over 10 yrs used commercial: still annual at same fee as used under 10 in practice
    return getFitnessTier('commercial_used');
  }

  return null;
}

/** Add whole years to a YYYY-MM-DD date (clamps day for month length). */
export function endDateFromValidity(startYmd: string, validityYears: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd)) {
    throw new Error(`Invalid start date: ${startYmd}`);
  }
  const [ys, ms, ds] = startYmd.split('-').map(Number);
  const end = new Date(Date.UTC(ys, ms - 1, ds));
  end.setUTCFullYear(end.getUTCFullYear() + validityYears);
  // Roll back one day so a 1-year cert starting 2025-10-17 ends 2026-10-16
  end.setUTCDate(end.getUTCDate() - 1);
  const y = end.getUTCFullYear();
  const m = String(end.getUTCMonth() + 1).padStart(2, '0');
  const d = String(end.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Annualized cost for a multi-year fitness certificate. */
export function annualizeFitnessFee(fee: number, validityYears: number): number {
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  const years = Math.max(1, Number(validityYears) || 1);
  return fee / years;
}
