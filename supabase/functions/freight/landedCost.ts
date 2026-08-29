/**
 * Jamaica Customs landed-cost calculator (compounded CET sequence).
 * Amounts in USD minor units (cents) unless noted JMD.
 */

export const USD_TAX_FREE_THRESHOLD_MINOR = 100_00; // US$100.00
export const SCF_RATE = 0.003;
export const ENV_RATE = 0.005;
/** Default import GCT rate (fraction). Prefer passing engine rate via LandedCostInput.gctRate. */
export const GCT_RATE = 0.15;

export const DEFAULT_STAMP_JMD_MINOR = 100_00; // J$100.00
export const DEFAULT_CAF_JMD_MINOR = 2500_00; // flat tier default J$2,500
export const DEFAULT_INSURANCE_RATE = 0.01;
export const DEFAULT_FX_USD_JMD = 155.5;

export type LandedCostInput = {
  itemCostUsdMinor: number;
  freightUsdMinor?: number | null;
  insuranceUsdMinor?: number | null;
  cetRate?: number | null; // 0–1
  stampJmdMinor?: number | null;
  cafJmdMinor?: number | null;
  fxUsdJmd?: number | null;
  /** Import GCT rate as fraction (s.8 base). Default GCT_RATE from engine seed (15%). */
  gctRate?: number | null;
};

export type LandedCostResult = {
  itemCostUsdMinor: number;
  freightUsdMinor: number;
  insuranceUsdMinor: number;
  cifUsdMinor: number;
  aboveThreshold: boolean;
  cetRate: number;
  importDutyUsdMinor: number;
  scfUsdMinor: number;
  envUsdMinor: number;
  gctUsdMinor: number;
  stampJmdMinor: number;
  cafJmdMinor: number;
  totalDutyUsdMinor: number;
  totalDutyJmdMinor: number;
  fxUsdJmd: number;
  breakdown: Record<string, number | boolean>;
};

function n(v: number | null | undefined, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(0, Math.round(x)) : fallback;
}

function jmdToUsdMinor(jmdMinor: number, fx: number): number {
  if (fx <= 0) return 0;
  return Math.round(jmdMinor / fx);
}

export function computeLandedCost(input: LandedCostInput): LandedCostResult {
  const itemCostUsdMinor = n(input.itemCostUsdMinor);
  const freightUsdMinor = n(input.freightUsdMinor);
  const insuranceUsdMinor =
    input.insuranceUsdMinor == null
      ? Math.round(itemCostUsdMinor * DEFAULT_INSURANCE_RATE)
      : n(input.insuranceUsdMinor);
  const cetRate = Math.min(1, Math.max(0, Number(input.cetRate ?? 0) || 0));
  const fxUsdJmd = Number(input.fxUsdJmd ?? DEFAULT_FX_USD_JMD) || DEFAULT_FX_USD_JMD;
  const stampJmdMinor = n(input.stampJmdMinor, DEFAULT_STAMP_JMD_MINOR);
  const cafJmdMinor = n(input.cafJmdMinor, DEFAULT_CAF_JMD_MINOR);

  const cifUsdMinor = itemCostUsdMinor + freightUsdMinor + insuranceUsdMinor;
  const aboveThreshold = cifUsdMinor > USD_TAX_FREE_THRESHOLD_MINOR;

  let importDutyUsdMinor = 0;
  let scfUsdMinor = 0;
  let envUsdMinor = 0;
  let gctUsdMinor = 0;
  let stampApplied = 0;
  let cafApplied = 0;

  if (aboveThreshold) {
    importDutyUsdMinor = Math.round(cifUsdMinor * cetRate);
    scfUsdMinor = Math.round(cifUsdMinor * SCF_RATE);
    envUsdMinor = Math.round(cifUsdMinor * ENV_RATE);
    const gctBase = cifUsdMinor + importDutyUsdMinor + scfUsdMinor + envUsdMinor;
    const gctRateFrac =
      input.gctRate != null && Number.isFinite(Number(input.gctRate))
        ? Math.min(1, Math.max(0, Number(input.gctRate)))
        : GCT_RATE;
    gctUsdMinor = Math.round(gctBase * gctRateFrac);
    stampApplied = stampJmdMinor;
    cafApplied = cafJmdMinor;
  }

  const stampUsdMinor = jmdToUsdMinor(stampApplied, fxUsdJmd);
  const cafUsdMinor = jmdToUsdMinor(cafApplied, fxUsdJmd);
  const totalDutyUsdMinor =
    importDutyUsdMinor + scfUsdMinor + envUsdMinor + gctUsdMinor + stampUsdMinor +
    cafUsdMinor;
  const totalDutyJmdMinor = Math.round(totalDutyUsdMinor * fxUsdJmd);

  return {
    itemCostUsdMinor,
    freightUsdMinor,
    insuranceUsdMinor,
    cifUsdMinor,
    aboveThreshold,
    cetRate,
    importDutyUsdMinor,
    scfUsdMinor,
    envUsdMinor,
    gctUsdMinor,
    stampJmdMinor: stampApplied,
    cafJmdMinor: cafApplied,
    totalDutyUsdMinor,
    totalDutyJmdMinor,
    fxUsdJmd,
    breakdown: {
      cifUsdMinor,
      aboveThreshold,
      cetRate,
      importDutyUsdMinor,
      scfUsdMinor,
      envUsdMinor,
      gctUsdMinor,
      stampJmdMinor: stampApplied,
      cafJmdMinor: cafApplied,
      stampUsdMinor,
      cafUsdMinor,
      totalDutyUsdMinor,
      totalDutyJmdMinor,
    },
  };
}
