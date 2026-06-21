/**
 * Dev-only smoke helpers. Import only behind import.meta.env.DEV.
 */
export const PARTNER_SMOKE_CHECKLIST = [
  'Login → Dashboard loads',
  'Orders: realtime new order toast + accept → preparing → ready',
  'Menu: add/edit item, toggle sold-out (long-press)',
  'Analytics: tabs render with live or empty data',
  'Store toggle synced across Orders, Menu, Analytics, Account',
] as const;

export function logPartnerSmokeChecklist() {
  if (!import.meta.env.DEV) return;
  console.group('[Roam Partner] Smoke checklist');
  PARTNER_SMOKE_CHECKLIST.forEach((item, index) => {
    console.log(`${index + 1}. ${item}`);
  });
  console.groupEnd();
}
