export const DASH_CUSTOMER_PRODUCTION_ORIGIN = 'https://roamdash.co';

export const DASH_CUSTOMER_OAUTH_INTENT_KEY = 'roam_dash_customer_oauth_intent';
export const DASH_CUSTOMER_OAUTH_INTENT_SIGNUP = 'signup';
export const DASH_CUSTOMER_OAUTH_INTENT_LOGIN = 'login';

export function getDashCustomerAuthRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/`;
  }
  return `${DASH_CUSTOMER_PRODUCTION_ORIGIN}/`;
}

export function clearDashCustomerOAuthIntent(): void {
  sessionStorage.removeItem(DASH_CUSTOMER_OAUTH_INTENT_KEY);
}

export function consumeDashCustomerOAuthIntent(): string | null {
  const intent = sessionStorage.getItem(DASH_CUSTOMER_OAUTH_INTENT_KEY);
  if (intent) {
    sessionStorage.removeItem(DASH_CUSTOMER_OAUTH_INTENT_KEY);
  }
  return intent;
}
