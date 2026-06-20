/**
 * Main app Supabase clients must not consume recovery tokens on `/reset-password`.
 * Only `supabaseRecovery` should read the URL there; otherwise the OTP is burned
 * and the user can appear logged in without setting a new password.
 */
export function shouldMainClientDetectSessionInUrl(): boolean {
  if (typeof window === 'undefined') return true;
  return window.location.pathname !== '/reset-password';
}
