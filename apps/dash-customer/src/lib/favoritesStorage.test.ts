import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchFavoriteMerchantIds = vi.fn();
const fetchFavoriteItems = vi.fn();
const addFavoriteMerchant = vi.fn();
const addFavoriteItem = vi.fn();
const isCustomerLoggedIn = vi.fn();

vi.mock('./customerApi', () => ({
  fetchFavoriteMerchantIds,
  fetchFavoriteItems,
  addFavoriteMerchant,
  addFavoriteItem,
  removeFavoriteMerchant: vi.fn(),
  removeFavoriteItem: vi.fn(),
  isCustomerLoggedIn,
}));

function stubLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
  return store;
}

describe('favoritesStorage sync', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    stubLocalStorage();
    isCustomerLoggedIn.mockResolvedValue(true);
    fetchFavoriteMerchantIds.mockResolvedValue(['remote-merchant']);
    fetchFavoriteItems.mockResolvedValue([{ merchantId: 'm1', menuItemId: 'item-1' }]);
  });

  it('server-wins: overwrites stale local favorites on sync', async () => {
    localStorage.setItem('roam-dash-favorite-restaurants', JSON.stringify(['stale-local']));
    localStorage.setItem('roam-dash-favorite-items', JSON.stringify(['other:item']));

    const { syncFavoritesFromBackend, getFavoriteRestaurants, getFavoriteItems } = await import(
      './favoritesStorage'
    );

    await syncFavoritesFromBackend();

    expect(getFavoriteRestaurants()).toEqual(['remote-merchant']);
    expect(getFavoriteItems()).toEqual(['m1:item-1']);
    expect(addFavoriteMerchant).not.toHaveBeenCalled();
    expect(addFavoriteItem).not.toHaveBeenCalled();
  });

  it('does not sync when logged out', async () => {
    isCustomerLoggedIn.mockResolvedValue(false);
    localStorage.setItem('roam-dash-favorite-restaurants', JSON.stringify(['guest-only']));

    const { syncFavoritesFromBackend, getFavoriteRestaurants } = await import('./favoritesStorage');

    await syncFavoritesFromBackend();

    expect(getFavoriteRestaurants()).toEqual(['guest-only']);
    expect(fetchFavoriteMerchantIds).not.toHaveBeenCalled();
  });

  it('clearFavoritesLocal removes keys and resets cache', async () => {
    localStorage.setItem('roam-dash-favorite-restaurants', JSON.stringify(['a']));
    localStorage.setItem('roam-dash-favorite-items', JSON.stringify(['m:i']));

    const { clearFavoritesLocal, getFavoriteRestaurants, getFavoriteItems } = await import(
      './favoritesStorage'
    );

    clearFavoritesLocal();

    expect(getFavoriteRestaurants()).toEqual([]);
    expect(getFavoriteItems()).toEqual([]);
  });
});
