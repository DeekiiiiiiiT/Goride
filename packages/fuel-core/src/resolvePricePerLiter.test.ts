import { describe, it, expect } from 'vitest';
import { resolvePricePerLiter } from './resolvePricePerLiter';

describe('resolvePricePerLiter', () => {
  it('uses observed gas-card cost / liters', () => {
    const r = resolvePricePerLiter({ totalLiters: 40, totalGasCardCost: 8000 });
    expect(r.pricePerLiter).toBe(200);
    expect(r.priceSource).toBe('fuel_entries');
    expect(r.priceUnavailable).toBe(false);
  });

  it('uses org default when observed price missing', () => {
    const r = resolvePricePerLiter({
      totalLiters: 0,
      totalGasCardCost: 0,
      defaultPricePerLiterJmd: 195,
    });
    expect(r.pricePerLiter).toBe(195);
    expect(r.priceSource).toBe('org_default');
    expect(r.priceUnavailable).toBe(false);
  });

  it('marks unavailable for cash-only / missing import (no invent 1.50)', () => {
    const r = resolvePricePerLiter({ totalLiters: 0, totalGasCardCost: 0 });
    expect(r.pricePerLiter).toBe(0);
    expect(r.priceSource).toBe('unavailable');
    expect(r.priceUnavailable).toBe(true);
  });

  it('marks unavailable when liters missing but cost present', () => {
    const r = resolvePricePerLiter({ totalLiters: 0, totalGasCardCost: 5000 });
    expect(r.priceUnavailable).toBe(true);
    expect(r.pricePerLiter).toBe(0);
  });

  it('ignores non-positive org default', () => {
    const r = resolvePricePerLiter({
      totalLiters: 10,
      totalGasCardCost: 0,
      defaultPricePerLiterJmd: 0,
    });
    expect(r.priceUnavailable).toBe(true);
  });
});
