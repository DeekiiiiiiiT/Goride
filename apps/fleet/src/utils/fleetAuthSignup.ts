import { isNativeCapacitorPlatform } from '@roam/types';

/** Set before fleet owner `signInWithOAuth`; cleared after provision attempt. */
export const FLEET_OAUTH_INTENT_KEY = 'roam_fleet_oauth_intent';
export const FLEET_OAUTH_INTENT_VALUE = '1';

/** Production web host. Native shell must not send OAuth back to https://localhost. */
export const FLEET_PRODUCTION_ORIGIN = 'https://roamfleet.co';

/** Deep link registered in AndroidManifest + Supabase redirect URLs. */
export const FLEET_NATIVE_AUTH_CALLBACK = 'co.roamenterprise.fleet://login';

export function fleetSignupRedirectUrl(): string {
  if (isNativeCapacitorPlatform()) return FLEET_NATIVE_AUTH_CALLBACK;
  const base = typeof window !== 'undefined' ? window.location.origin : FLEET_PRODUCTION_ORIGIN;
  return `${base}/signup`;
}

export function isFleetAuthCallbackUrl(url: string): boolean {
  return (
    url.startsWith(FLEET_NATIVE_AUTH_CALLBACK) ||
    url.startsWith(`${FLEET_PRODUCTION_ORIGIN}/`)
  );
}

export function fleetSignupUrl(fromRoamdriver?: boolean): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://roamfleet.co';
  const q = fromRoamdriver ? '?from=roamdriver' : '';
  return `${base}/signup${q}`;
}
