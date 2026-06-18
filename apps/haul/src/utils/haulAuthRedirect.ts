export const HAUL_PRODUCTION_ORIGIN = 'https://roamhaul.co';
export const HAULER_OAUTH_INTENT_KEY = 'roam_hauler_oauth_intent';
export const HAULER_OAUTH_INTENT_VALUE = '1';

export function getHaulAuthRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/`;
  }
  return `${HAUL_PRODUCTION_ORIGIN}/`;
}
