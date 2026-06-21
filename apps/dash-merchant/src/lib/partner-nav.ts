import { PartnerTab } from './partner-utils';

export type PartnerSideNavKey = PartnerTab | 'history' | 'support';

export const PARTNER_SIDE_NAV: {
  key: PartnerSideNavKey;
  label: string;
  icon: string;
  tab?: PartnerTab;
}[] = [
  { key: 'orders', label: 'Orders', icon: 'receipt_long', tab: 'orders' },
  { key: 'menu', label: 'Menu', icon: 'restaurant_menu', tab: 'menu' },
  { key: 'analytics', label: 'Analytics', icon: 'monitoring', tab: 'analytics' },
  { key: 'history', label: 'History', icon: 'history' },
  { key: 'support', label: 'Support', icon: 'help_center' },
];

export function resolveSideNavKey(activeTab: PartnerTab): PartnerSideNavKey {
  return activeTab;
}
