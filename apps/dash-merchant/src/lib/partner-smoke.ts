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
  'Orders: realtime primary (delivery.orders replication) + adaptive poll fallback; no 10s refresh banner',
  'Menu: add/edit item, toggle sold-out, drag reorder',
  'Analytics: overview + sales breakdown (category, day, hour charts)',
  'Earnings: Account → Earnings loads live or empty state',
  'Team: invite persists after refresh (API-backed)',
  'Team: invite email sent when SMTP configured (or owner warning toast)',
  'Team: invitee accept flow via /team-invite/:token',
  'Team: bootstrap blocked when pending team invite exists',
  'Staff ops: owner enables beta toggle on Team page',
  'Staff ops: counter staff sees Counter hub when flag on',
  'Staff ops: kitchen staff sees Kitchen queue when flag on',
  'Staff ops: flag off keeps legacy OrdersPage for all staff',
  'Staff ops: invite assigns job station; accept lands on correct view',
  'Staff PIN: owner enables tablet PIN toggle on Team page',
  'Staff PIN: owner adds floor staff without email',
  'Staff PIN: tablet shows staff picker then PIN before Counter/Kitchen',
  'Staff PIN: first login creates PIN; owner reset forces new PIN',
  'Staff PIN: order actions attribute to roster member when on shift',
  'Staff PIN: flags off keeps legacy email invite + staff login',
  'Store tablet: welcome screen offers Owner sign in vs Store tablet',
  'Store tablet: owner generates pairing code + station QR links on Team page',
  'Store tablet: /tablet?code=ROAM-XXXX&station=kitchen enrolls without owner login',
  'Store tablet: paired tablet shows staff picker locked to enrolled station',
  'Store tablet: regenerate pairing code disconnects all tablets',
  'Store tablet: legacy owner-login + Orders tab kiosk still works when flags on',
  'Store tablet: team invite URL unaffected',
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
  'Team invite email or owner warning when SMTP off',
  'Invitee accept without starting owner onboarding',
  'Promotion create persists after refresh',
  'Analytics sales breakdown shows category/day/hour charts',
  'Push notification on new order (if webhook configured)',
] as const;

export const RESTAURANT_MGMT_UI_SMOKE = [
  'Restaurant mgmt: flag off hides opt-in card and keeps Roam-only path',
  'Restaurant mgmt: preview flag shows opt-in card with fixture data',
  'Restaurant mgmt: enable in-store ops adds capability via API',
  'Restaurant mgmt: 3-step setup wizard saves tax, printer, receipt footer',
  'Restaurant mgmt: hub sub-nav POS, Inventory, Reports, Settings',
  'POS: menu grid, cart, checkout order type, card/cash payment, success sheet',
  'POS: preview uses fixtures; live uses menu API + createPosOrder',
  'Inventory: ingredients list, stock adjust, recipe editor',
  'Reports: in-store sales today/week totals',
  'Print: settings panel + test print queues job',
  'Counter/Kitchen: OrderChannelChip when in_store capability + order.channel',
  'Counter/Kitchen: channel=all fetch when show in-store setting enabled',
  'Team: POS station + inventory permission when in-store enabled',
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
