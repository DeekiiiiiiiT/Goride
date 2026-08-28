import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CUSTOMER_USER_LOCAL_STORAGE_KEYS,
  clearCustomerLocalData,
} from './customerLocalData';

vi.mock('./rushPushSubscribe', () => ({
  unsubscribeRushPush: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./favoritesStorage', () => ({
  clearFavoritesLocal: vi.fn(() => {
    localStorage.removeItem('roam-dash-favorite-restaurants');
    localStorage.removeItem('roam-dash-favorite-items');
    localStorage.removeItem('roam-dash-favorites');
  }),
}));

vi.mock('./searchRecents', () => ({
  clearRecentSearches: vi.fn(() => {
    localStorage.removeItem('roam-dash-recent-searches');
  }),
}));

function stubStorage() {
  const local = new Map<string, string>();
  const session = new Map<string, string>();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => {
        local.set(key, value);
      },
      removeItem: (key: string) => {
        local.delete(key);
      },
      clear: () => {
        local.clear();
      },
    },
  });

  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => {
        session.set(key, value);
      },
      removeItem: (key: string) => {
        session.delete(key);
      },
      clear: () => {
        session.clear();
      },
    },
  });

  return { local, session };
}

describe('clearCustomerLocalData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes all per-user keys and session cart vertical', async () => {
    const { local, session } = stubStorage();

    local.set('roam-dash-profile', '{}');
    local.set('roam-dash-favorite-restaurants', '["a"]');
    local.set('roam-dash-favorite-items', '[]');
    local.set('roam-dash-recent-searches', '["pizza"]');
    local.set('roam-dash-customer-onboarding-complete', 'true');
    local.set('roam-dash-delivery-zones-v7', '{}');
    session.set('roam_cart_vertical', 'grocery');

    for (const key of CUSTOMER_USER_LOCAL_STORAGE_KEYS) {
      local.set(key, 'x');
    }

    await clearCustomerLocalData();

    for (const key of CUSTOMER_USER_LOCAL_STORAGE_KEYS) {
      expect(local.get(key)).toBeUndefined();
    }
    expect(local.get('roam-dash-favorite-restaurants')).toBeUndefined();
    expect(local.get('roam-dash-favorite-items')).toBeUndefined();
    expect(local.get('roam-dash-recent-searches')).toBeUndefined();
    expect(local.get('roam-dash-customer-onboarding-complete')).toBe('true');
    expect(local.get('roam-dash-delivery-zones-v7')).toBe('{}');
    expect(session.get('roam_cart_vertical')).toBeUndefined();
  });
});
