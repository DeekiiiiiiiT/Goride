import { PartnerTab } from './partner-utils';
import type { MerchantMembership } from '../types/team';

/** Optional nav label when staff has a job station (e.g. Kitchen). */
export function getPartnerTabLabel(
  tab: PartnerTab,
  membership?: MerchantMembership | null,
): string {
  if (tab === 'orders' && membership?.job_station === 'kitchen') {
    return 'Kitchen';
  }
  return PARTNER_BOTTOM_NAV_ITEMS.find((item) => item.key === tab)?.label ?? tab;
}

export type PartnerNavItem = { key: PartnerTab; label: string; icon: string };

/** Primary destinations shown in the mobile bottom tab bar. */
export const PARTNER_BOTTOM_NAV_ITEMS: PartnerNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'orders', label: 'Orders', icon: 'receipt_long' },
  { key: 'menu', label: 'Menu', icon: 'restaurant_menu' },
  { key: 'analytics', label: 'Analytics', icon: 'leaderboard' },
  { key: 'account', label: 'Account', icon: 'person' },
];

/** Drawer-only destinations when the bottom tab bar is visible. */
export const PARTNER_DRAWER_SUPPLEMENT_ITEMS: PartnerNavItem[] = [
  { key: 'earnings', label: 'Earnings', icon: 'payments' },
];

export function getPartnerDrawerPrimaryItems(
  bottomNavVisible: boolean,
  allowedTabs: PartnerTab[],
): PartnerNavItem[] {
  const bottomItems = PARTNER_BOTTOM_NAV_ITEMS.filter((item) => allowedTabs.includes(item.key));
  const supplementItems = PARTNER_DRAWER_SUPPLEMENT_ITEMS.filter((item) =>
    allowedTabs.includes(item.key),
  );

  if (bottomNavVisible) {
    return supplementItems;
  }

  return [...bottomItems, ...supplementItems];
}

export type PartnerSideNavKey = PartnerTab | 'history' | 'support';

/** Desktop side nav — all primary Partner destinations + History/Support. */
export const PARTNER_SIDE_NAV: {
  key: PartnerSideNavKey;
  label: string;
  icon: string;
  tab?: PartnerTab;
}[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', tab: 'dashboard' },
  { key: 'orders', label: 'Orders', icon: 'receipt_long', tab: 'orders' },
  { key: 'menu', label: 'Menu', icon: 'restaurant_menu', tab: 'menu' },
  { key: 'analytics', label: 'Analytics', icon: 'monitoring', tab: 'analytics' },
  { key: 'earnings', label: 'Earnings', icon: 'payments', tab: 'earnings' },
  { key: 'account', label: 'Account', icon: 'person', tab: 'account' },
  { key: 'history', label: 'History', icon: 'history' },
  { key: 'support', label: 'Support', icon: 'help_center' },
];

export function resolveSideNavKey(activeTab: PartnerTab): PartnerSideNavKey {
  return activeTab;
}

/** Filter side nav by staff permissions (History/Support always kept). */
export function getAllowedSideNavItems(allowedTabs: PartnerTab[]) {
  return PARTNER_SIDE_NAV.filter((item) => {
    if (item.key === 'history' || item.key === 'support') return true;
    if (!item.tab) return true;
    return allowedTabs.includes(item.tab);
  });
}
