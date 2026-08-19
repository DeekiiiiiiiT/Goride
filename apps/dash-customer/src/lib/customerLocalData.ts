import { clearFavoritesLocal } from './favoritesStorage';
import { clearRecentSearches } from './searchRecents';
import { unsubscribeRushPush } from './rushPushSubscribe';

/** Per-user localStorage keys cleared on sign-out. */
export const CUSTOMER_USER_LOCAL_STORAGE_KEYS = [
  'roam-dash-profile',
  'roam-dash-saved-addresses',
  'roam-dash-delivery-address',
  'roam-dash-cart',
  'roam-dash-checkout',
  'roam-dash-notification-prefs',
  'roam-dash-payment-alt',
  'roam_rush_native_push_token',
  'roam_rush_web_push_endpoint',
] as const;

const SESSION_CART_VERTICAL_KEY = 'roam_cart_vertical';

/** Wipe all per-user cached data when the session ends (shared-device safety). */
export async function clearCustomerLocalData(): Promise<void> {
  try {
    await unsubscribeRushPush();
  } catch {
    // Push may not be registered on this device.
  }

  clearFavoritesLocal();
  clearRecentSearches();

  for (const key of CUSTOMER_USER_LOCAL_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(SESSION_CART_VERTICAL_KEY);
  }
}
