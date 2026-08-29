import { describe, expect, it } from 'vitest';
import { resolveRatePercentAsOf } from './rates.ts';
import { resolveTaxPoint } from './taxPoint.ts';
import { resolveOrderGct } from './orderGct.ts';
import { apportionInputCredit, resolveCreditableInputTax } from './inputTax.ts';
import { isPassengerTransportExempt } from './supplyClasses.ts';
import type { GctRateRow } from './types.ts';

const RATES: GctRateRow[] = [
  {
    supplyClass: 'standard',
    ratePercent: 16.5,
    effectiveFrom: '2010-01-01',
    effectiveTo: '2020-03-31',
  },
  {
    supplyClass: 'standard',
    ratePercent: 15,
    effectiveFrom: '2020-04-01',
    effectiveTo: null,
  },
  {
    supplyClass: 'tourism',
    ratePercent: 10,
    effectiveFrom: '2020-04-01',
    effectiveTo: null,
  },
];

describe('resolveRatePercentAsOf', () => {
  it('returns 15% on/after 2020-04-01', () => {
    expect(resolveRatePercentAsOf(RATES, 'standard', '2020-04-01')).toBe(15);
    expect(resolveRatePercentAsOf(RATES, 'standard', '2026-08-29')).toBe(15);
  });

  it('returns prior rate before change', () => {
    expect(resolveRatePercentAsOf(RATES, 'standard', '2020-03-31')).toBe(16.5);
  });

  it('returns 0 for exempt', () => {
    expect(resolveRatePercentAsOf(RATES, 'exempt', '2026-01-01')).toBe(0);
  });

  it('throws when no row covers date', () => {
    expect(() => resolveRatePercentAsOf(RATES, 'telephone', '2026-01-01')).toThrow();
  });
});

describe('resolveTaxPoint', () => {
  it('picks earliest of invoice/payment/delivery', () => {
    const tp = resolveTaxPoint({
      invoiceAt: '2026-08-10T12:00:00Z',
      paymentAt: '2026-08-05T12:00:00Z',
      deliveryAt: '2026-08-12T12:00:00Z',
    });
    expect(tp.toISOString()).toBe('2026-08-05T12:00:00.000Z');
  });

  it('throws when empty', () => {
    expect(() => resolveTaxPoint({})).toThrow();
  });
});

describe('resolveOrderGct', () => {
  it('splits food and platform', () => {
    const r = resolveOrderGct({
      discountedSubtotal: 1000,
      serviceFee: 100,
      deliveryFeePlatformAmount: 50,
      smallOrderFee: 0,
      foodRatePercent: 15,
      platformRatePercent: 15,
    });
    expect(r.taxFoodJmd).toBe(150);
    expect(r.taxPlatformJmd).toBe(22.5);
    expect(r.tax).toBe(172.5);
  });
});

describe('input tax', () => {
  it('blocks entertainment credit', () => {
    expect(
      resolveCreditableInputTax({ taxAmountJmd: 100, restriction: 'entertainment' }),
    ).toBe(0);
  });

  it('apportions partly-exempt', () => {
    expect(
      apportionInputCredit({
        inputTaxJmd: 100,
        taxableSuppliesJmd: 600,
        totalSuppliesJmd: 1000,
      }),
    ).toBe(60);
  });
});

describe('passenger transport', () => {
  it('is exempt', () => {
    expect(isPassengerTransportExempt()).toBe('exempt');
  });
});
