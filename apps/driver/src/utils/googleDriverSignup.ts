import type { User } from '@supabase/supabase-js';
import type { DriverProfile } from '../contexts/DriverContext';

/** After demographics saved (row exists, phone step next). */
export const GOOGLE_ONBOARDING_PHONE = 'g_phone';
/** Phone verified; archetype + fleet CTA next. */
export const GOOGLE_ONBOARDING_ARCHETYPE = 'g_archetype';

export function userHasGoogleIdentity(user: User | null): boolean {
  if (!user?.identities?.length) return false;
  return user.identities.some(i => i.provider === 'google');
}

/**
 * Google sign-in users must complete extended onboarding (demographics, phone, archetype)
 * until `driver_profiles.onboarding_complete` is true and Google-specific steps are cleared.
 */
export function needsGoogleExtendedSignup(user: User | null, profile: DriverProfile | null): boolean {
  if (!user || !userHasGoogleIdentity(user)) return false;
  if (profile?.onboardingComplete) return false;
  if (!profile) return true;
  const step = profile.onboardingStep ?? '';
  if (step === GOOGLE_ONBOARDING_PHONE || step === GOOGLE_ONBOARDING_ARCHETYPE) return true;
  return false;
}

export function defaultRoamFleetSignupUrl(): string {
  const base =
    typeof import.meta.env.VITE_ROAM_FLEET_SIGNUP_URL === 'string' &&
    import.meta.env.VITE_ROAM_FLEET_SIGNUP_URL.trim()
      ? import.meta.env.VITE_ROAM_FLEET_SIGNUP_URL.trim().replace(/\/$/, '')
      : 'https://roamfleet.co';
  return `${base}/signup?from=roamdriver`;
}
