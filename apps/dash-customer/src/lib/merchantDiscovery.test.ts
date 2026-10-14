import { describe, expect, it } from 'vitest';
import {
  applyCategoryListFilters,
  filterMerchantsByCategory,
  interpretDiscoveryPayload,
  type DiscoverMerchant,
} from './merchantDiscovery';

const merchants: DiscoverMerchant[] = [
  {
    id: 'mario',
    name: "Mario's Pizzeria",
    cuisines: 'Pizza, Italian',
    rating: 4.5,
    eta: '25-40 min',
    delivery: 'J$150',
    image: '',
    vertical_type: 'restaurant',
  },
  {
    id: 'grill',
    name: 'Island Grill',
    cuisines: 'Jamaican, Jerk',
    rating: 4.8,
    eta: '30-45 min',
    delivery: 'J$200',
    image: '',
    vertical_type: 'restaurant',
  },
];

describe('filterMerchantsByCategory', () => {
  it('returns every merchant for all', () => {
    expect(filterMerchantsByCategory(merchants, 'all')).toHaveLength(2);
  });

  it('matches cuisine without fake restaurants', () => {
    const pizza = filterMerchantsByCategory(merchants, 'pizza');
    expect(pizza.map((m) => m.id)).toEqual(['mario']);
  });
});

describe('applyCategoryListFilters', () => {
  const mixed: DiscoverMerchant[] = [
    ...merchants,
    {
      id: 'quick',
      name: 'Quick Bites',
      cuisines: 'Fast Food',
      rating: 3.8,
      eta: '12-20 min',
      delivery: 'Free',
      image: '',
      vertical_type: 'restaurant',
    },
  ];

  it('filters 4.0+ and under 30 independently', () => {
    const rated = applyCategoryListFilters(mixed, {
      sort: 'rating',
      minRating4: true,
      under30: false,
      offersOnly: false,
    });
    expect(rated.map((m) => m.id)).toEqual(['grill', 'mario']);

    const fast = applyCategoryListFilters(mixed, {
      sort: 'rating',
      minRating4: false,
      under30: true,
      offersOnly: false,
    });
    expect(fast.map((m) => m.id)).toEqual(['mario', 'quick']);
  });

  it('keeps stores with live offers', () => {
    const offered = applyCategoryListFilters(
      mixed,
      { sort: 'rating', minRating4: false, under30: false, offersOnly: true },
      new Set(['grill']),
    );
    expect(offered.map((m) => m.id)).toEqual(['grill']);
  });
});

describe('interpretDiscoveryPayload', () => {
  it('names an inactive town instead of an empty store list', () => {
    expect(
      interpretDiscoveryPayload(
        {
          out_of_coverage: true,
          coming_soon: true,
          town_name: 'Highgate',
          market_id: 'town-highgate',
        },
        false,
      ),
    ).toEqual({
      outOfCoverage: true,
      missingPin: false,
      comingSoon: true,
      townName: 'Highgate',
      marketId: 'town-highgate',
    });
  });

  it('asks for an address when the pin is missing', () => {
    expect(interpretDiscoveryPayload({ missing_pin: true }, false).missingPin).toBe(true);
  });

  it('does not treat a live town with stores as coming soon', () => {
    expect(
      interpretDiscoveryPayload(
        { coming_soon: true, town_name: 'Highgate', out_of_coverage: true },
        true,
      ).outOfCoverage,
    ).toBe(false);
  });
});
