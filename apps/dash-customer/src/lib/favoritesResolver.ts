import { fetchDiscoverMerchants, type DiscoverMerchant } from './merchantDiscovery';
import { fetchMerchantMenu } from './merchantMenu';
import { allowMocks } from './mocksGate';
import { getRestaurantProfile, type RestaurantProfile } from './restaurantContent';
import { parseFavoriteItemKey, type FavoriteItemKey } from './favoriteItemKey';

export type ResolvedFavoriteRestaurant = {
  merchantId: string;
  name: string;
  cuisines: string;
  rating: number;
  eta: string;
  deliveryFee: string;
  image: string;
  unavailable?: boolean;
};

export type ResolvedFavoriteItem = {
  id: FavoriteItemKey;
  itemId: string;
  merchantId: string;
  merchantName: string;
  name: string;
  price: number;
  image: string;
  unavailable?: boolean;
};

export function matchDiscoverMerchant(
  merchants: DiscoverMerchant[],
  favoriteId: string,
): DiscoverMerchant | undefined {
  return merchants.find((row) => row.id === favoriteId || row.slug === favoriteId);
}

export function restaurantFromDiscover(merchant: DiscoverMerchant): ResolvedFavoriteRestaurant {
  return {
    merchantId: merchant.id,
    name: merchant.name,
    cuisines: merchant.cuisines,
    rating: merchant.rating,
    eta: merchant.eta,
    deliveryFee: merchant.delivery,
    image: merchant.image,
  };
}

function restaurantFromProfile(profile: RestaurantProfile, fallbackId: string): ResolvedFavoriteRestaurant {
  return {
    merchantId: profile.id || fallbackId,
    name: profile.name,
    cuisines: profile.cuisines,
    rating: profile.rating,
    eta: profile.eta,
    deliveryFee: profile.deliveryFee,
    image: profile.heroImage || profile.logoImage,
  };
}

export function unavailableRestaurant(favoriteId: string): ResolvedFavoriteRestaurant {
  return {
    merchantId: favoriteId,
    name: 'Store unavailable',
    cuisines: 'This store is no longer listed',
    rating: 0,
    eta: '',
    deliveryFee: '',
    image: '',
    unavailable: true,
  };
}

export function resolveFavoriteRestaurantFromCatalog(
  favoriteId: string,
  merchants: DiscoverMerchant[],
): ResolvedFavoriteRestaurant | null {
  const live = matchDiscoverMerchant(merchants, favoriteId);
  return live ? restaurantFromDiscover(live) : null;
}

export function resolveFavoriteItemFromMenus(
  key: FavoriteItemKey,
  menus: RestaurantProfile[],
): ResolvedFavoriteItem | null {
  const parsed = parseFavoriteItemKey(key);
  if (!parsed) return null;
  const profile = menus.find((row) => row.id === parsed.merchantId);
  if (!profile) return null;
  const item = profile.items.find((row) => row.id === parsed.itemId);
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

/** Live lookup for Favorites. Falls back to mock menus only when allowMocks(). */
export async function resolveFavoriteRestaurants(ids: string[]): Promise<ResolvedFavoriteRestaurant[]> {
  if (ids.length === 0) return [];
  const { merchants } = await fetchDiscoverMerchants();
  const resolved: ResolvedFavoriteRestaurant[] = [];
  for (const id of ids) {
    const fromCatalog = resolveFavoriteRestaurantFromCatalog(id, merchants);
    if (fromCatalog) {
      resolved.push(fromCatalog);
      continue;
    }
    try {
      const profile = await fetchMerchantMenu(id);
      resolved.push(restaurantFromProfile(profile, id));
    } catch {
      if (allowMocks()) {
        resolved.push(restaurantFromProfile(getRestaurantProfile(id), id));
      } else {
        resolved.push(unavailableRestaurant(id));
      }
    }
  }
  return resolved;
}

export async function resolveFavoriteItems(keys: FavoriteItemKey[]): Promise<ResolvedFavoriteItem[]> {
  if (keys.length === 0) return [];
  const merchantIds = Array.from(
    new Set(keys.map((key) => parseFavoriteItemKey(key)?.merchantId).filter((id): id is string => Boolean(id))),
  );
  const menus = (
    await Promise.all(
      merchantIds.map(async (merchantId) => {
        try {
          return await fetchMerchantMenu(merchantId);
        } catch {
          return allowMocks() ? getRestaurantProfile(merchantId) : null;
        }
      }),
    )
  ).filter((row): row is RestaurantProfile => row != null);

  return keys.map((key) => {
    const parsed = parseFavoriteItemKey(key);
    if (!parsed) {
      return {
        id: key,
        itemId: '',
        merchantId: '',
        merchantName: '',
        name: 'Item unavailable',
        price: 0,
        image: '',
        unavailable: true,
      };
    }
    const fromMenu = resolveFavoriteItemFromMenus(key, menus);
    if (fromMenu) return fromMenu;
    return {
      id: key,
      itemId: parsed.itemId,
      merchantId: parsed.merchantId,
      merchantName: 'Item unavailable',
      name: 'This item is no longer on the menu',
      price: 0,
      image: '',
      unavailable: true,
    };
  });
}
