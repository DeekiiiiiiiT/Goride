import type { PersonalAllowanceBand, PersonalAllowanceTierConfig, QuotaConfig } from '../types/data';

/** Canonical bonus ledger key shape (prefs map or future KV). */
export function personalAllowanceBonusKey(driverId: string, weekStartYmd: string): string {
  return `personal_allowance_bonus:${driverId}:${weekStartYmd}`;
}

export const DEFAULT_PERSONAL_ALLOWANCE_BANDS: PersonalAllowanceBand[] = [
  { minPctInclusive: 0, maxPctExclusive: 60, earnedKm: 0 },
  { minPctInclusive: 60, maxPctExclusive: 80, earnedKm: 40 },
  { minPctInclusive: 80, maxPctExclusive: 100, earnedKm: 75 },
  { minPctInclusive: 100, maxPctExclusive: null, earnedKm: 100 },
];

export const DEFAULT_PERSONAL_ALLOWANCE: PersonalAllowanceTierConfig = {
  /** Enabled by default for new policies (Cycles + PA Economics plan). Existing KV policies keep their stored flag until flipped in UI. */
  enabled: true,
  /** null → use weekly quota from QuotaConfig, else 100_000 JMD fallback */
  weeklyQuotaOverrideJmd: null,
  nextWeekBonusKm: 20,
  bands: DEFAULT_PERSONAL_ALLOWANCE_BANDS.map((b) => ({ ...b })),
};

export function mergePersonalAllowanceDefaults(
  raw: Partial<PersonalAllowanceTierConfig> | null | undefined,
): PersonalAllowanceTierConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PERSONAL_ALLOWANCE, bands: DEFAULT_PERSONAL_ALLOWANCE_BANDS.map((b) => ({ ...b })) };
  }
  const bands =
    Array.isArray(raw.bands) && raw.bands.length > 0
      ? raw.bands.map((b) => ({
          minPctInclusive: Number(b.minPctInclusive) || 0,
          maxPctExclusive:
            b.maxPctExclusive === null || b.maxPctExclusive === undefined
              ? null
              : Number(b.maxPctExclusive),
          earnedKm: Math.max(0, Number(b.earnedKm) || 0),
        }))
      : DEFAULT_PERSONAL_ALLOWANCE_BANDS.map((b) => ({ ...b }));
  return {
    enabled: raw.enabled === undefined ? DEFAULT_PERSONAL_ALLOWANCE.enabled : !!raw.enabled,
    weeklyQuotaOverrideJmd:
      raw.weeklyQuotaOverrideJmd === null || raw.weeklyQuotaOverrideJmd === undefined
        ? null
        : Number(raw.weeklyQuotaOverrideJmd),
    nextWeekBonusKm: Math.max(0, Number(raw.nextWeekBonusKm) || 0),
    bands,
  };
}

export function resolveWeeklyQuotaJmd(
  config: PersonalAllowanceTierConfig,
  quotaConfig: QuotaConfig | null | undefined,
): number {
  if (config.weeklyQuotaOverrideJmd != null && config.weeklyQuotaOverrideJmd > 0) {
    return config.weeklyQuotaOverrideJmd;
  }
  const weekly = quotaConfig?.weekly?.amount ?? 0;
  return weekly > 0 ? weekly : 100_000; // suggested default when unset
}

export function computeQuotaPct(earningsJmd: number, quotaJmd: number): number {
  if (!quotaJmd || quotaJmd <= 0) return 0;
  return (Math.max(0, earningsJmd) / quotaJmd) * 100;
}

/** First matching band; open-ended top when maxPctExclusive is null. */
export function earnedPersonalKmFromBands(pct: number, bands: PersonalAllowanceBand[]): number {
  const sorted = [...bands].sort((a, b) => a.minPctInclusive - b.minPctInclusive);
  for (const band of sorted) {
    const aboveMin = pct >= band.minPctInclusive;
    const belowMax = band.maxPctExclusive == null || pct < band.maxPctExclusive;
    if (aboveMin && belowMax) return Math.max(0, band.earnedKm);
  }
  // Past all closed bands → use highest open or last band
  const open = sorted.find((b) => b.maxPctExclusive == null);
  if (open && pct >= open.minPctInclusive) return Math.max(0, open.earnedKm);
  if (sorted.length && pct >= sorted[sorted.length - 1].minPctInclusive) {
    return Math.max(0, sorted[sorted.length - 1].earnedKm);
  }
  return 0;
}

export function isTopBandHit(pct: number, bands: PersonalAllowanceBand[]): boolean {
  const sorted = [...bands].sort((a, b) => a.minPctInclusive - b.minPctInclusive);
  const top = [...sorted].reverse().find((b) => b.maxPctExclusive == null) ?? sorted[sorted.length - 1];
  if (!top) return false;
  return pct >= top.minPctInclusive && (top.maxPctExclusive == null || pct < top.maxPctExclusive);
}

export type PersonalAllowanceSplitResult = {
  skip: boolean;
  measuredKm: number;
  earnedKm: number;
  overageKm: number;
  earnedCost: number;
  overageCost: number;
  quotaPct: number;
  weeklyEarnings: number;
  weeklyQuota: number;
  hitTopBand: boolean;
};

export function computePersonalAllowanceSplit(args: {
  measuredKm: number;
  efficiencyKmPerL: number;
  pricePerLiter: number;
  earningsJmd: number;
  config: PersonalAllowanceTierConfig;
  quotaConfig?: QuotaConfig | null;
  priorWeekBonusKm?: number;
}): PersonalAllowanceSplitResult {
  const measuredKm = Math.max(0, args.measuredKm || 0);
  if (!args.config.enabled) {
    return {
      skip: true,
      measuredKm,
      earnedKm: 0,
      overageKm: measuredKm,
      earnedCost: 0,
      overageCost: 0,
      quotaPct: 0,
      weeklyEarnings: args.earningsJmd || 0,
      weeklyQuota: 0,
      hitTopBand: false,
    };
  }

  const weeklyQuota = resolveWeeklyQuotaJmd(args.config, args.quotaConfig);
  const weeklyEarnings = Math.max(0, args.earningsJmd || 0);
  const quotaPct = computeQuotaPct(weeklyEarnings, weeklyQuota);
  const bandKm = earnedPersonalKmFromBands(quotaPct, args.config.bands);
  const bonus = Math.max(0, args.priorWeekBonusKm || 0);
  const earnedKm = Math.min(measuredKm, bandKm + bonus);
  const overageKm = Math.max(0, measuredKm - earnedKm);
  const eff = args.efficiencyKmPerL > 0 ? args.efficiencyKmPerL : 10;
  const price = args.pricePerLiter > 0 ? args.pricePerLiter : 0;
  const costPerKm = price / eff;
  return {
    skip: false,
    measuredKm,
    earnedKm,
    overageKm,
    earnedCost: earnedKm * costPerKm,
    overageCost: overageKm * costPerKm,
    quotaPct,
    weeklyEarnings,
    weeklyQuota,
    hitTopBand: isTopBandHit(quotaPct, args.config.bands),
  };
}

export type BandValidationError = string | null;

export function validatePersonalAllowanceBands(bands: PersonalAllowanceBand[]): BandValidationError {
  if (!bands.length) return 'Add at least one milestone band';
  const sorted = [...bands].sort((a, b) => a.minPctInclusive - b.minPctInclusive);
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (b.minPctInclusive < 0 || b.earnedKm < 0) return 'Percent and earned km cannot be negative';
    if (b.maxPctExclusive != null && b.maxPctExclusive <= b.minPctInclusive) {
      return 'Each band max % must be greater than min %';
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.maxPctExclusive == null) return 'Only the top band may be open-ended';
      if (b.minPctInclusive < prev.maxPctExclusive) return 'Bands must not overlap';
    }
  }
  const openCount = sorted.filter((b) => b.maxPctExclusive == null).length;
  if (openCount > 1) return 'Only one open-ended (top) band is allowed';
  return null;
}

/** Frozen audit block stored on WeeklyFuelReport.metadata.personalAllowance */
export type PersonalAllowanceReportMeta = {
  quotaPct: number;
  weeklyEarnings: number;
  weeklyQuota: number;
  earnedKm: number;
  overageKm: number;
  earnedCost: number;
  overageCost: number;
  hitTopBand: boolean;
  configSnapshot?: PersonalAllowanceTierConfig;
};

export function buildPersonalAllowanceMetadata(
  split: PersonalAllowanceSplitResult | null | undefined,
  config?: PersonalAllowanceTierConfig,
): PersonalAllowanceReportMeta | undefined {
  if (!split || split.skip) return undefined;
  return {
    quotaPct: split.quotaPct,
    weeklyEarnings: split.weeklyEarnings,
    weeklyQuota: split.weeklyQuota,
    earnedKm: split.earnedKm,
    overageKm: split.overageKm,
    earnedCost: split.earnedCost,
    overageCost: split.overageCost,
    hitTopBand: split.hitTopBand,
    configSnapshot: config,
  };
}

type ReportLike = {
  personalUsageCost: number;
  driverShare: number;
  metadata?: { personalAllowance?: PersonalAllowanceReportMeta | null };
};

/** Amount fed into scenario personalCoverage split (overage when allowance active). */
export function personalCostForCoverageSplit(report: ReportLike): number {
  const overage = report.metadata?.personalAllowance?.overageCost;
  return typeof overage === 'number' ? overage : report.personalUsageCost;
}

/** Company-absorbed earned Personal $ (0 when policy off). */
export function personalEarnedCostAbsorbed(report: ReportLike): number {
  const earned = report.metadata?.personalAllowance?.earnedCost;
  return typeof earned === 'number' ? earned : 0;
}

/** Driver-facing Personal $ line (overage when on; full measured when off). */
export function driverFacingPersonalCost(report: ReportLike): number {
  return personalCostForCoverageSplit(report);
}

/** Residual of driverShare after Personal (overage) line — misc/deadhead/RS driver portions. */
export function driverShareExcludingPersonal(report: ReportLike): number {
  return report.driverShare - driverFacingPersonalCost(report);
}

