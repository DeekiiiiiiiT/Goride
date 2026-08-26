export type FuelPriceSource = 'fuel_entries' | 'org_default' | 'unavailable';

export type ResolvePricePerLiterInput = {
  totalLiters: number;
  totalGasCardCost: number;
  /** Org-configured JMD/L when observed price cannot be computed. */
  defaultPricePerLiterJmd?: number | null;
};

export type ResolvePricePerLiterResult = {
  pricePerLiter: number;
  priceSource: FuelPriceSource;
  /** True when no observed or org default price — callers must not invent personal-usage JMD. */
  priceUnavailable: boolean;
};

/**
 * Resolve JMD per litre for recon / personal-usage charges.
 * Never falls back to a USD-era 1.50 constant.
 */
export function resolvePricePerLiter(
  input: ResolvePricePerLiterInput,
): ResolvePricePerLiterResult {
  const liters = Number(input.totalLiters) || 0;
  const cost = Number(input.totalGasCardCost) || 0;
  if (liters > 0 && cost > 0) {
    return {
      pricePerLiter: cost / liters,
      priceSource: 'fuel_entries',
      priceUnavailable: false,
    };
  }
  const orgDefault = Number(input.defaultPricePerLiterJmd);
  if (Number.isFinite(orgDefault) && orgDefault > 0) {
    return {
      pricePerLiter: orgDefault,
      priceSource: 'org_default',
      priceUnavailable: false,
    };
  }
  return {
    pricePerLiter: 0,
    priceSource: 'unavailable',
    priceUnavailable: true,
  };
}
