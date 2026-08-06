import { isNativeCapacitorPlatform } from '@roam/types';

/** Production web host for Roam Rush (not the Android package id). */
export const DASH_CUSTOMER_PRODUCTION_ORIGIN = 'https://roamrush.app';

/** Native deep link registered in AndroidManifest + Supabase redirect URLs. */
export const DASH_CUSTOMER_NATIVE_AUTH_CALLBACK = 'co.roamenterprise.rush://login';

export const DASH_CUSTOMER_OAUTH_INTENT_KEY = 'roam_dash_customer_oauth_intent';
export const DASH_CUSTOMER_OAUTH_INTENT_SIGNUP = 'signup';
export const DASH_CUSTOMER_OAUTH_INTENT_LOGIN = 'login';

/** Phone OTP sign-up/verify. Enable when Digicel/Flow SMS is paid and configured. */
export const ENABLE_PHONE_AUTH = false;

/**
 * Supabase OAuth / email `redirectTo`.
 * Capacitor serves the app at https://localhost — never use window.location.origin on native.
 */
export function getDashCustomerAuthRedirectUrl(): string {
  const native = isNativeCapacitorPlatform();
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : null;
  let redirectTo: string;
  let branch: 'native' | 'origin' | 'production';
  if (native) {
    redirectTo = DASH_CUSTOMER_NATIVE_AUTH_CALLBACK;
    branch = 'native';
  } else if (origin) {
    redirectTo = `${origin}/`;
    branch = 'origin';
  } else {
    redirectTo = `${DASH_CUSTOMER_PRODUCTION_ORIGIN}/`;
    branch = 'production';
  }
  // #region agent log
  fetch('http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'be05d1'},body:JSON.stringify({sessionId:'be05d1',runId:'pre-fix',hypothesisId:'B',location:'dashCustomerAuth.ts:getDashCustomerAuthRedirectUrl',message:'computed auth redirect',data:{native,origin,branch,redirectTo},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return redirectTo;
}

export function isDashCustomerAuthCallbackUrl(url: string): boolean {
  return (
    url.startsWith(DASH_CUSTOMER_NATIVE_AUTH_CALLBACK) ||
    url.startsWith(`${DASH_CUSTOMER_PRODUCTION_ORIGIN}/`)
  );
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
