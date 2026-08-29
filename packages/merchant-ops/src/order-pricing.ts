/**
 * POS / merchant cart pricing — shared by dash-merchant + rush-command.
 * Mirrors supabase/functions/_shared/orderPricing.ts (server is authoritative).
 */

export type PosPricingLine = {
  unitPrice: number;
  quantity: number;
  modifiers?: Array<{ priceAdjustment: number }>;
};

export type PosOrderPricingInput = {
  lines: PosPricingLine[];
  /** Required when gctRegistered !== false. Missing/non-finite must not silently become 0%. */
  taxRatePercent?: number | null;
  discount?: number;
  gctRegistered?: boolean;
};

export type PosOrderPricingResult = {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Resolve POS tax rate — fail-closed for registered merchants (matches server orderPricing).
 * Unregistered → 0. Registered with missing/invalid rate → throws.
 */
export function resolvePosTaxRatePercent(input: {
  taxRatePercent?: number | null;
  gctRegistered?: boolean;
}): number {
  if (input.gctRegistered === false) return 0;
  if (input.taxRatePercent != null && Number.isFinite(Number(input.taxRatePercent))) {
    return Math.max(0, Number(input.taxRatePercent));
  }
  throw new Error(
    'taxRatePercent is required for GCT pricing when merchant is GCT-registered',
  );
}

export function calculateOrderPricing(input: PosOrderPricingInput): PosOrderPricingResult {
  const discount = input.discount ?? 0;
  const taxRate = resolvePosTaxRatePercent(input) / 100;

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
