/**
 * Dev-only smoke helpers. Import only behind import.meta.env.DEV.
 */
export const PARTNER_ONBOARDING_REGRESSION = [
  'Approved merchant login → dashboard + bottom nav (no wizard)',
  'Fresh signup → auth → 6-step wizard → AccountPendingPage',
  'Mid-wizard refresh → draft resumes at correct step (server + sessionStorage)',
  'Partner sign-in → POST /partner/bootstrap creates draft merchant row',
  'Admin Unfinished setup → shows Step N of 7 for draft merchants only',
  'Rejected merchant → resubmit application works',
  'Use a different account → clears draft + returns to login',
  'Google OAuth signup → wizard step 4 email prefilled from session',
  'Step 1 collects name/description/cuisine/business type only (no phone/email)',
  'Phone + email collected once on step 4 only',
] as const;

export const PARTNER_SMOKE_CHECKLIST = [
  'Auth: Splash → Welcome → Login (email or Google)',
  'Onboarding: logged-in user without merchant sees 6-step unified wizard',
  'Onboarding: branding step uploads logo/cover with crop',
  'Onboarding: verification documents upload on step 5',
  'Login → Dashboard loads (approved merchant)',
  'Orders: realtime new order toast + accept → preparing → ready',
  'Menu: add/edit item, toggle sold-out, drag reorder',
  'Analytics: overview + sales breakdown (category, day, hour charts)',
  'Earnings: Account → Earnings loads live or empty state',
  'Team: invite persists after refresh (API-backed)',
  'Promotions: create persists after refresh (API-backed)',
  'Profile: verification banner shows correct variant when not approved',
  'Store toggle synced across Orders, Menu, Analytics, Account',
] as const;

export const PARTNER_PRODUCTION_SMOKE = [
  'partner.roamdash.co logged out → Welcome page',
  'Logged in without merchant → 6-step onboarding wizard',
  'Complete wizard → AccountPendingPage with merchant row in DB',
  'Dashboard, Orders, Menu, Analytics, Account load (approved)',
  'Earnings from Account hub works (live API or empty state)',
  'Team invite persists after refresh',
  'Promotion create persists after refresh',
  'Analytics sales breakdown shows category/day/hour charts',
  'Push notification on new order (if webhook configured)',
] as const;

export function logPartnerSmokeChecklist() {
  if (!import.meta.env.DEV) return;
  console.group('[Roam Partner] Smoke checklist');
  PARTNER_SMOKE_CHECKLIST.forEach((item, index) => {
    console.log(`${index + 1}. ${item}`);
  });
  console.groupEnd();
}

export function logPartnerOnboardingRegression() {
  if (!import.meta.env.DEV) return;
  console.group('[Roam Partner] Onboarding regression matrix');
  PARTNER_ONBOARDING_REGRESSION.forEach((item, index) => {
    console.log(`${index + 1}. ${item}`);
  });
  console.groupEnd();
}
