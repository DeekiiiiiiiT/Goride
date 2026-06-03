import { isNativeCapacitorPlatform } from '@roam/types';

/** Production web host for Roam Driver (not the Android package id). */
export const DRIVER_PRODUCTION_ORIGIN = 'https://roamdriver.co';

/** Native deep link registered in AndroidManifest + Supabase redirect URLs. */
export const DRIVER_NATIVE_AUTH_CALLBACK = 'co.roamenterprise.driver://login';

/**
 * Supabase `emailRedirectTo` / OAuth `redirectTo`.
 * Capacitor serves the app at https://localhost — never use window.location.origin on native.
 */
export function getDriverAuthRedirectUrl(): string {
  if (isNativeCapacitorPlatform()) {
    return DRIVER_NATIVE_AUTH_CALLBACK;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/`;
  }
  return `${DRIVER_PRODUCTION_ORIGIN}/`;
}

export function isDriverAuthCallbackUrl(url: string): boolean {
  return (
    url.startsWith(DRIVER_NATIVE_AUTH_CALLBACK) ||
    url.startsWith(`${DRIVER_PRODUCTION_ORIGIN}/`)
  );
}
