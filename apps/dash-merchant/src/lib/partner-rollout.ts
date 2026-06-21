/**
 * Partner app rollout flags and routing contract (internal).
 *
 * REGRESSION MATRIX (manual, run before each phase cutover):
 * 1. Approved merchant login → dashboard + bottom nav (no onboarding)
 * 2. Login-only user, no merchant → OnboardingPage OR UnifiedWizard (flag on)
 * 3. Merchant verification_status rejected → banner + resubmit works
 * 4. Merchant pending/in_review/docs_requested → AccountPendingPage
 * 5. Fresh signup → auth → wizard → pending page with merchant row in DB
 * 6. Page refresh mid-wizard → draft resumes (sessionStorage) or API state intact
 *
 * ROUTING CONTRACT (App.tsx):
 * - !session → PartnerAuthFlow (welcome | carousel | login)
 * - session + (pendingSignUp legacy OR pending verification) → AccountPendingPage
 * - session + !merchant → OnboardingPage | UnifiedOnboardingWizard (flag)
 * - session + approved + !goLiveDismissed → OnboardingCompletePage
 * - session + approved + goLive → main app (unchanged)
 *
 * GCP / Supabase prerequisites:
 * - Maps JavaScript API, Places API (new), Geocoding API enabled
 * - GOOGLE_MAPS_API_KEY secret on delivery edge (referrer: partner.roamdash.co)
 * - Storage buckets: merchant-assets (public), merchant-documents (private)
 */

function parseEnvBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

/** When true, post-auth UnifiedOnboardingWizard replaces legacy OnboardingPage. */
export function isUnifiedOnboardingEnabled(): boolean {
  return parseEnvBool(import.meta.env.VITE_PARTNER_UNIFIED_ONBOARDING, false);
}
