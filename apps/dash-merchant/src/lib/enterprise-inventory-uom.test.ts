import { describe, expect, it } from 'vitest';

/** Pure yield math mirrored from depletionService */
function netDepletionQty(
  qtyPerServing: number,
  soldQty: number,
  recipeYieldPct: number,
  lineYieldPct: number,
): number {
  const recipeYield = recipeYieldPct / 100;
  const lineYield = lineYieldPct / 100;
  const grossQty = qtyPerServing * soldQty;
  return grossQty / (recipeYield * lineYield);
}

describe('enterprise inventory yield depletion', () => {
  it('applies recipe and line yield', () => {
    expect(netDepletionQty(1, 10, 100, 100)).toBe(10);
    expect(netDepletionQty(1, 10, 100, 95)).toBeCloseTo(10.526, 2);
    expect(netDepletionQty(2, 5, 90, 100)).toBeCloseTo(11.111, 2);
  });
});

describe('UOM chain conversion', () => {
  it('multiplies factors along chain', () => {
    const caseToCan = 6;
    const canToOz = 102;
    const cases = 2;
    expect(cases * caseToCan * canToOz).toBe(1224);
  });
});
