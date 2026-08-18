/**
 * Shared "is this dollar amount meaningfully nonzero" thresholds.
 * Keep consumers on these named constants so recon / settlement / ledger stay aligned.
 */
export const FUEL_SPEND_EPS = 0.009;
export const FUEL_MONEY_EPS = 0.01;
export const FUEL_LEDGER_EPS = 1e-9;

export function isFuelSpendMeaningful(n: number): boolean {
  return Math.abs(Number(n) || 0) > FUEL_SPEND_EPS;
}

export function isFuelMoneyMeaningful(n: number): boolean {
  return Math.abs(Number(n) || 0) > FUEL_MONEY_EPS;
}
