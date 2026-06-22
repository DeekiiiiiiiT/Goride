/**
 * Partner app routing contract and rollout notes (internal).
 *
 * CANONICAL ONBOARDING: UnifiedOnboardingWizard (7 steps). See partner-onboarding-config.ts.
 *
 * REGRESSION MATRIX: see PARTNER_ONBOARDING_REGRESSION in partner-smoke.ts
 *
 * ROUTING CONTRACT (App.tsx):
 * - !session → PartnerAuthFlow (welcome | carousel | login)
 * - session + !merchant → UnifiedOnboardingWizard
 * - session + owner + incomplete application → UnifiedOnboardingWizard
 * - session + owner + pending verification → AccountPendingPage
 * - session + owner + approved + verified_at + !goLiveDismissed → OnboardingCompletePage
 * - session + owner + approved + goLive → main app
 * - session + team member → main app (no owner onboarding gates)
 *
 * ROLLBACK PROCEDURE (if onboarding issues in production):
 * 1. Git revert to last known-good UnifiedOnboardingWizard / step components
 * 2. Redeploy — no database migration required (API contract unchanged)
 * 3. Monitor POST /delivery/merchants 4xx/5xx and incomplete applications
 *
 * GCP / Supabase prerequisites:
 * - Maps JavaScript API, Places API (new), Geocoding API enabled
 * - GOOGLE_MAPS_API_KEY secret on delivery edge (referrer: partner.roamdash.co)
 * - Storage buckets: merchant-assets (public), merchant-documents (private)
 */
