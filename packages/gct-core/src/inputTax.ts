import type { InputTaxCreditRestriction } from './types.ts';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Apply Reg.14-style credit restrictions to input tax.
 * entertainment / motor_vehicle / de_minimis → 0 credit.
 * capital_24m / apportioned → caller supplies fraction via creditFraction (0–1).
 */
export function resolveCreditableInputTax(input: {
  taxAmountJmd: number;
  restriction: InputTaxCreditRestriction;
  /** For capital_24m or apportioned — portion allowed (0–1). Default 1. */
  creditFraction?: number;
}): number {
  const tax = Math.max(0, input.taxAmountJmd);
  switch (input.restriction) {
    case 'entertainment':
    case 'motor_vehicle':
    case 'de_minimis':
      return 0;
    case 'capital_24m':
    case 'apportioned': {
      const frac = Math.min(1, Math.max(0, input.creditFraction ?? 1));
      return roundMoney(tax * frac);
    }
    case 'none':
    default:
      return roundMoney(tax);
  }
}

/** Partly-exempt trader: input credit × (taxable / total) supplies. */
export function apportionInputCredit(input: {
  inputTaxJmd: number;
  taxableSuppliesJmd: number;
  totalSuppliesJmd: number;
}): number {
  const total = Math.max(0, input.totalSuppliesJmd);
  if (total <= 0) return 0;
  const taxable = Math.max(0, Math.min(input.taxableSuppliesJmd, total));
  return roundMoney(Math.max(0, input.inputTaxJmd) * (taxable / total));
}
