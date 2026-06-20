export const COURIER_PRODUCTION_ORIGIN = 'https://courier.roamdash.co';

export const COURIER_OAUTH_INTENT_KEY = 'roam_courier_oauth_intent';
export const COURIER_OAUTH_INTENT_SIGNUP = 'signup';
export const COURIER_OAUTH_INTENT_LOGIN = 'login';

export function getCourierAuthRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/`;
  }
  return `${COURIER_PRODUCTION_ORIGIN}/`;
}
