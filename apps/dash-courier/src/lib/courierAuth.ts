import { isNativeCapacitorPlatform } from '@roam/types';

/** Production web host for Dash Courier (not the Android package id). */
export const COURIER_PRODUCTION_ORIGIN = 'https://courier.roamdash.co';

/** Native deep link registered in AndroidManifest + Supabase redirect URLs. */
export const COURIER_NATIVE_AUTH_CALLBACK = 'co.roamenterprise.courier://login';

export const COURIER_OAUTH_INTENT_KEY = 'roam_courier_oauth_intent';
export const COURIER_OAUTH_INTENT_SIGNUP = 'signup';
export const COURIER_OAUTH_INTENT_LOGIN = 'login';

/**
 * Supabase OAuth / email `redirectTo`.
 * Capacitor serves the app at https://localhost — never use window.location.origin on native.
 */
export function getCourierAuthRedirectUrl(): string {
  if (isNativeCapacitorPlatform()) {
    return COURIER_NATIVE_AUTH_CALLBACK;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/`;
  }
  return `${COURIER_PRODUCTION_ORIGIN}/`;
}

export function isCourierAuthCallbackUrl(url: string): boolean {
  return (
    url.startsWith(COURIER_NATIVE_AUTH_CALLBACK) ||
    url.startsWith(`${COURIER_PRODUCTION_ORIGIN}/`)
  );
}
