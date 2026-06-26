import type { PosCartLine, PosPricingResult } from '../types/restaurant-mgmt';

export interface PricingInput {
  lines: PosCartLine[];
  taxRatePercent?: number;
  discount?: number;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/** Client-side cart pricing — mirrors supabase/functions/_shared/orderPricing.ts */
export function calculateOrderPricing(input: PricingInput): PosPricingResult {
  const discount = input.discount ?? 0;
  const taxRate = (input.taxRatePercent ?? 0) / 100;

  const subtotal = roundMoney(
    input.lines.reduce((sum, line) => {
      const modifierTotal =
        line.modifiers?.reduce((acc, mod) => acc + mod.priceAdjustment, 0) ?? 0;
      const unitWithMods = line.unitPrice + modifierTotal;
      return sum + unitWithMods * line.quantity;
    }, 0),
  );

  const taxable = Math.max(0, subtotal - discount);
  const tax = roundMoney(taxable * taxRate);
  const total = roundMoney(taxable + tax);

  return { subtotal, tax, discount: roundMoney(discount), total };
}
