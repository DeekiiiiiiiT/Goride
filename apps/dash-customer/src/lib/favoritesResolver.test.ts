import { describe, expect, it } from 'vitest';
import { toFavoriteItemKey } from './favoriteItemKey';
import {
  matchDiscoverMerchant,
  resolveFavoriteItemFromMenus,
  resolveFavoriteRestaurantFromCatalog,
  unavailableRestaurant,
} from './favoritesResolver';
import type { DiscoverMerchant } from './merchantDiscovery';
import type { RestaurantProfile } from './restaurantContent';

const merchants: DiscoverMerchant[] = [
  {
    id: 'uuid-grill',
    slug: 'island-grill',
    name: 'Island Grill',
    cuisines: 'Jamaican',
    rating: 4.8,
    eta: '30-45 min',
    delivery: 'J$200',
    image: 'grill.jpg',
    vertical_type: 'restaurant',
  },
];

const menu: RestaurantProfile = {
  id: 'uuid-grill',
  name: 'Island Grill',
  cuisines: 'Jamaican',
  rating: 4.8,
  ratingCount: 10,
  eta: '30-45 min',
  distance: '',
  deliveryFee: 'J$200',
  promoTitle: '',
  promoCode: '',
  heroImage: '',
  logoImage: '',
  hours: [],
  address: '',
  phone: '',
  categories: [],
  items: [
    {
      id: 'jerk',
      name: 'Jerk Chicken',
      description: '',
      price: 1200,
      image: 'jerk.jpg',
      categoryId: 'chicken',
      modifiers: [],
    },
  ],
};

describe('favorites catalog resolve', () => {
  it('matches saved slug or uuid against live merchants', () => {
    expect(matchDiscoverMerchant(merchants, 'island-grill')?.id).toBe('uuid-grill');
    expect(resolveFavoriteRestaurantFromCatalog('uuid-grill', merchants)?.name).toBe('Island Grill');
  });

  it('resolves a favorite dish from the live menu', () => {
    const key = toFavoriteItemKey('uuid-grill', 'jerk');
    const item = resolveFavoriteItemFromMenus(key, [menu]);
    expect(item?.name).toBe('Jerk Chicken');
    expect(item?.price).toBe(1200);
  });

  it('marks missing stores instead of dropping them', () => {
    expect(unavailableRestaurant('gone').unavailable).toBe(true);
    expect(resolveFavoriteRestaurantFromCatalog('gone', merchants)).toBeNull();
  });
});
