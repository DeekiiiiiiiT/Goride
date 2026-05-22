/** Set before fleet owner `signInWithOAuth`; cleared after provision attempt. */
export const FLEET_OAUTH_INTENT_KEY = 'roam_fleet_oauth_intent';
export const FLEET_OAUTH_INTENT_VALUE = '1';

export function fleetSignupRedirectUrl(): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://roamfleet.co';
  return `${base}/signup`;
}

export function fleetSignupUrl(fromRoamdriver?: boolean): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://roamfleet.co';
  const q = fromRoamdriver ? '?from=roamdriver' : '';
  return `${base}/signup${q}`;
}
