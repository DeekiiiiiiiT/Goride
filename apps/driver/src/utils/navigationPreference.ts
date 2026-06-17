export type NavigationProvider = 'google_maps' | 'waze';

/** localStorage key for the driver's default external navigation app. */
export const NAVIGATION_PROVIDER_STORAGE_KEY = 'roam-driver-navigation-provider';

/** Safe default — matches pre-feature behavior (Google Maps only). */
export const DEFAULT_NAVIGATION_PROVIDER: NavigationProvider = 'google_maps';

export const NAVIGATION_PROVIDER_LABELS: Record<NavigationProvider, string> = {
  google_maps: 'Google Maps',
  waze: 'Waze',
};

export function isNavigationProvider(value: unknown): value is NavigationProvider {
  return value === 'google_maps' || value === 'waze';
}

/**
 * Sync read for use outside React (e.g. openExternalNavigation in ride hooks).
 * Returns DEFAULT_NAVIGATION_PROVIDER when storage is missing or invalid.
 */
export function readNavigationProvider(): NavigationProvider {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_NAVIGATION_PROVIDER;
    }
    const stored = localStorage.getItem(NAVIGATION_PROVIDER_STORAGE_KEY);
    if (isNavigationProvider(stored)) {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_NAVIGATION_PROVIDER;
}

export function writeNavigationProvider(provider: NavigationProvider): void {
  if (!isNavigationProvider(provider)) {
    return;
  }
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(NAVIGATION_PROVIDER_STORAGE_KEY, provider);
  } catch {
    /* ignore */
  }
}

export function getNavigationProviderLabel(provider: NavigationProvider): string {
  return NAVIGATION_PROVIDER_LABELS[provider];
}
