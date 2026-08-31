export type FuelPriceSource = 'fuel_entries' | 'unavailable';

export type ResolvePricePerLiterInput = {
  totalLiters: number;
  totalGasCardCost: number;
};

export type ResolvePricePerLiterResult = {
  pricePerLiter: number;
  priceSource: FuelPriceSource;
  /** True when no observed gas-card price — callers must not invent personal-usage JMD. */
  priceUnavailable: boolean;
};

/**
 * Resolve JMD per litre from real fill data only.
 * Never invents a fallback / org default / USD-era constant.
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
  return {
    pricePerLiter: 0,
    priceSource: 'unavailable',
    priceUnavailable: true,
  };
}
