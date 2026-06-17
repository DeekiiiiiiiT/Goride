import type { NavigationProvider } from './navigationPreference';
import { readNavigationProvider } from './navigationPreference';
import { openExternalUrl } from './openExternalUrl';

export type NavTarget = {
  lat: number;
  lng: number;
  address?: string | null;
};

export function isValidNavCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return false;
  }
  if (lat === 0 && lng === 0) {
    return false;
  }
  return true;
}

export function buildGoogleMapsDirectionsUrl({ lat, lng, address }: NavTarget): string {
  const destination =
    address?.trim()
      ? encodeURIComponent(address.trim())
      : encodeURIComponent(`${lat},${lng}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

export function buildWazeUrl({ lat, lng, address }: NavTarget): string | null {
  if (isValidNavCoord(lat, lng)) {
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }
  const trimmedAddress = address?.trim();
  if (trimmedAddress) {
    return `https://waze.com/ul?q=${encodeURIComponent(trimmedAddress)}&navigate=yes`;
  }
  return null;
}

/**
 * Builds the external navigation URL for the given provider and destination.
 * Waze falls back to address search when coordinates are unavailable.
 */
export function buildNavigationUrl(
  provider: NavigationProvider,
  target: NavTarget,
): string | null {
  if (provider === 'waze') {
    return buildWazeUrl(target);
  }
  return buildGoogleMapsDirectionsUrl(target);
}

/**
 * Opens turn-by-turn navigation using the driver's saved preference
 * (`roam-driver-navigation-provider`, default Google Maps).
 * Roam keeps running in the background; GPS uploads pause when the tab is hidden
 * but resume on visibilitychange (see useActiveRideTracking).
 */
export function openExternalNavigation(target: NavTarget): void {
  const provider = readNavigationProvider();
  const url = buildNavigationUrl(provider, target);
  if (!url) return;
  void openExternalUrl(url);
}
