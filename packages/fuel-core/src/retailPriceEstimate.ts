export type FuelGrade = 'gasolene87' | 'gasolene90' | 'autoDiesel' | 'ulsd';

export type PetrojamWholesaleRow = {
  priceDate: string;
  gasolene87?: number | null;
  gasolene90?: number | null;
  autoDiesel?: number | null;
  ulsd?: number | null;
};

export type RetailMarkupVersion = {
  id: string;
  effectiveFrom: string;
  gasolene87Markup: number;
  gasolene90Markup: number;
  autoDieselMarkup: number;
  ulsdMarkup: number;
  isPublished?: boolean;
};

export type RetailEstimateResult = {
  wholesaleJmd: number;
  markupJmd: number;
  retailEstimateJmd: number;
  priceVersionId: string;
  grade: FuelGrade;
  priceDate: string;
};

function gradeWholesale(row: PetrojamWholesaleRow, grade: FuelGrade): number | null {
  const v =
    grade === 'gasolene87'
      ? row.gasolene87
      : grade === 'gasolene90'
        ? row.gasolene90
        : grade === 'autoDiesel'
          ? row.autoDiesel
          : row.ulsd;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function gradeMarkup(m: RetailMarkupVersion, grade: FuelGrade): number {
  if (grade === 'gasolene87') return Number(m.gasolene87Markup) || 0;
  if (grade === 'gasolene90') return Number(m.gasolene90Markup) || 0;
  if (grade === 'autoDiesel') return Number(m.autoDieselMarkup) || 0;
  return Number(m.ulsdMarkup) || 0;
}

/** Pick the latest published markup with effectiveFrom <= priceDate. */
export function pickMarkupForDate(
  versions: RetailMarkupVersion[],
  priceDateYmd: string,
): RetailMarkupVersion | null {
  const ymd = String(priceDateYmd).split('T')[0];
  const eligible = versions
    .filter((v) => v.isPublished !== false && String(v.effectiveFrom).split('T')[0] <= ymd)
    .sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
  return eligible[0] || null;
}

/**
 * retailEstimate = petrojam wholesale + markup version additives.
 * Does not invent numbers when wholesale or markup missing.
 */
export function resolveRetailEstimate(input: {
  wholesale: PetrojamWholesaleRow;
  markupVersions: RetailMarkupVersion[];
  grade: FuelGrade;
}): RetailEstimateResult | null {
  const priceDate = String(input.wholesale.priceDate).split('T')[0];
  const wholesaleJmd = gradeWholesale(input.wholesale, input.grade);
  if (wholesaleJmd == null) return null;
  const markup = pickMarkupForDate(input.markupVersions, priceDate);
  if (!markup) return null;
  const markupJmd = gradeMarkup(markup, input.grade);
  return {
    wholesaleJmd,
    markupJmd,
    retailEstimateJmd: wholesaleJmd + markupJmd,
    priceVersionId: markup.id,
    grade: input.grade,
    priceDate,
  };
}

/** Default relative threshold for price outliers (18%). */
export const DEFAULT_PRICE_OUTLIER_PCT = 0.18;

/** Flag when paid $/L is materially above a benchmark (retail estimate or station median). */
export function isPriceOutlier(
  paidPerLiter: number,
  retailEstimate: number,
  pct = DEFAULT_PRICE_OUTLIER_PCT,
): boolean {
  if (!(paidPerLiter > 0) || !(retailEstimate > 0)) return false;
  return (paidPerLiter - retailEstimate) / retailEstimate >= pct;
}

/** Median of positive numbers; null if empty. */
export function medianPositive(values: number[]): number | null {
  const sorted = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}
