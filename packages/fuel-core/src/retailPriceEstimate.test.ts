import { describe, it, expect } from 'vitest';
import {
  resolveRetailEstimate,
  isPriceOutlier,
  pickMarkupForDate,
} from './retailPriceEstimate';

describe('retailPriceEstimate', () => {
  const versions = [
    {
      id: 'v1',
      effectiveFrom: '2026-01-01',
      gasolene87Markup: 40,
      gasolene90Markup: 42,
      autoDieselMarkup: 35,
      ulsdMarkup: 35,
      isPublished: true,
    },
    {
      id: 'v2',
      effectiveFrom: '2026-06-01',
      gasolene87Markup: 45,
      gasolene90Markup: 47,
      autoDieselMarkup: 38,
      ulsdMarkup: 38,
      isPublished: true,
    },
  ];

  it('picks latest markup on or before date', () => {
    expect(pickMarkupForDate(versions, '2026-03-15')?.id).toBe('v1');
    expect(pickMarkupForDate(versions, '2026-07-01')?.id).toBe('v2');
  });

  it('resolves retail = wholesale + markup', () => {
    const r = resolveRetailEstimate({
      wholesale: { priceDate: '2026-07-10', gasolene90: 200 },
      markupVersions: versions,
      grade: 'gasolene90',
    });
    expect(r?.retailEstimateJmd).toBe(247);
    expect(r?.priceVersionId).toBe('v2');
  });

  it('flags 18%+ over estimate as outlier', () => {
    expect(isPriceOutlier(300, 247, 0.18)).toBe(true);
    expect(isPriceOutlier(250, 247, 0.18)).toBe(false);
  });
});
