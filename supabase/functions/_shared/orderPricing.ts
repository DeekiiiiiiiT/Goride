export interface PricingLineInput {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  modifiers?: Array<{ name: string; priceAdjustment: number }>;
}

export interface PricingInput {
  lines: PricingLineInput[];
  taxRatePercent?: number;
  discount?: number;
}

export interface PricingResult {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  lineItems: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    options?: Array<{
      name: string;
      selections: Array<{ name: string; priceAdjustment: number }>;
    }>;
  }>;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/** Shared cart pricing for Roam checkout and in-store POS. */
export function calculateOrderPricing(input: PricingInput): PricingResult {
  const discount = input.discount ?? 0;
  const taxRate = (input.taxRatePercent ?? 0) / 100;

  const lineItems = input.lines.map((line) => {
    const modifierTotal =
      line.modifiers?.reduce((sum, mod) => sum + mod.priceAdjustment, 0) ?? 0;
    const unitWithMods = line.unitPrice + modifierTotal;
    const lineTotal = roundMoney(unitWithMods * line.quantity);
    return {
      menuItemId: line.menuItemId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: roundMoney(unitWithMods),
      lineTotal,
      options:
        line.modifiers && line.modifiers.length > 0
          ? [
              {
                name: 'Modifiers',
                selections: line.modifiers.map((m) => ({
                  name: m.name,
                  priceAdjustment: m.priceAdjustment,
                })),
              },
            ]
          : undefined,
    };
  });

  const subtotal = roundMoney(lineItems.reduce((sum, line) => sum + line.lineTotal, 0));
  const taxable = Math.max(0, subtotal - discount);
  const tax = roundMoney(taxable * taxRate);
  const total = roundMoney(taxable + tax);

  return { subtotal, tax, discount: roundMoney(discount), total, lineItems };
}
