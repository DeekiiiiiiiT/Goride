/**
 * Dev-only smoke helpers. Import only behind import.meta.env.DEV.
 */
export const PARTNER_SMOKE_CHECKLIST = [
  'Auth: Splash → Welcome → Login (emerald design, not orange legacy)',
  'Onboarding: logged-in user without merchant sees 5-step wizard',
  'Onboarding: branding step uploads logo/cover with crop',
  'Login → Dashboard loads',
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
  'partner.roamdash.co logged out → new Welcome page',
  'Logged in without merchant → new onboarding wizard',
  'Dashboard, Orders, Menu, Analytics, Account load',
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
