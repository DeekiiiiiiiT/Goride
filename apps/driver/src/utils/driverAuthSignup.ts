/** Set before `signInWithOAuth`; AuthContext clears after attaching `role: 'driver'` if missing. */
export const DRIVER_OAUTH_INTENT_KEY = 'roam_driver_oauth_intent';
export const DRIVER_OAUTH_INTENT_VALUE = '1';

/** Phone OTP sign-in/sign-up on the splash screen. Enable when Supabase SMS is configured. */
export const ENABLE_PHONE_AUTH = false;
