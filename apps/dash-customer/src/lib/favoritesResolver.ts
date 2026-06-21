import { FEATURED_RESTAURANTS, POPULAR_RESTAURANTS, SEARCH_RESULTS, type DiscoverRestaurant } from '@/lib/discoverContent';
import { getRestaurantProfile } from '@/lib/restaurantContent';
import { searchDishes } from '@/lib/searchDishes';
import type { FavoriteItemKey } from '@/lib/favoritesStorage';

const ALL_RESTAURANTS: DiscoverRestaurant[] = [
  ...FEATURED_RESTAURANTS,
  ...POPULAR_RESTAURANTS,
  ...SEARCH_RESULTS,
];

export function resolveFavoriteRestaurant(merchantId: string) {
  const fromDiscover = ALL_RESTAURANTS.find((r) => r.id === merchantId);
  if (fromDiscover) {
    return {
      merchantId,
      name: fromDiscover.name,
      cuisines: fromDiscover.cuisines,
      rating: fromDiscover.rating,
      eta: fromDiscover.eta,
      deliveryFee: fromDiscover.delivery,
      image: fromDiscover.image,
    };
  }
  const profile = getRestaurantProfile(merchantId);
  return {
    merchantId: profile.id,
    name: profile.name,
    cuisines: profile.cuisines,
    rating: profile.rating,
    eta: profile.eta,
    deliveryFee: profile.deliveryFee,
    image: profile.heroImage,
  };
}

export function resolveFavoriteItem(key: FavoriteItemKey) {
  const [merchantId, itemId] = key.split(':');
  const dish = searchDishes('').find((d) => d.merchantId === merchantId && d.itemId === itemId);
  if (dish) return dish;
  const profile = getRestaurantProfile(merchantId);
  const item = profile.items.find((i) => i.id === itemId);
  if (!item) return null;
  return {
    id: key,
    itemId: item.id,
    merchantId: profile.id,
    merchantName: profile.name,
    name: item.name,
    price: item.price,
    image: item.image,
  };
}
