import {
  BadgeDollarSign,
  Bike,
  HandCoins,
  Headphones,
  Landmark,
  LayoutDashboard,
  Map,
  Radar,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  TicketPercent,
  UserRound,
} from 'lucide-react';
import type { AdminConfig, AdminNavBadge } from '@roam/admin-core';
import { canOpenCapabilityForRoles, type DashCapability } from './dashAdminCapabilities';

export const ALLOWED_DASH_ADMIN_ROLES = [
  'platform_owner',
  'platform_support',
  'platform_analyst',
  'superadmin',
  'dash_admin',
  'dash_ops',
  'courier_admin',
  'courier_ops',
  'dash_concierge',
];

const NAV: Array<{ group: string; label?: string; items: Array<{ id: string; label: string; icon: AdminConfig['groups'][number]['items'][number]['icon']; capability: DashCapability }> }> = [
  {
    group: 'home',
    items: [{ id: 'home', label: 'Home', icon: LayoutDashboard, capability: 'home' }],
  },
  {
    group: 'operations',
    label: 'Operations',
    items: [
      { id: 'dispatch', label: 'Dispatch', icon: Radar, capability: 'dispatch' },
      { id: 'orders', label: 'Orders', icon: ReceiptText, capability: 'orders' },
      { id: 'support', label: 'Support', icon: Headphones, capability: 'support' },
      { id: 'in-house', label: 'In-House desk', icon: ShoppingBag, capability: 'in-house' },
    ],
  },
  {
    group: 'network',
    label: 'Network',
    items: [
      { id: 'merchants', label: 'Merchants', icon: Store, capability: 'merchants' },
      { id: 'couriers', label: 'Couriers', icon: Bike, capability: 'couriers' },
      { id: 'customers', label: 'Customers', icon: UserRound, capability: 'customers' },
    ],
  },
  {
    group: 'coverage',
    label: 'Coverage',
    items: [{ id: 'markets', label: 'Markets', icon: Map, capability: 'markets' }],
  },
  {
    group: 'money',
    label: 'Money',
    items: [
      { id: 'finance', label: 'Finance', icon: Landmark, capability: 'finance' },
      { id: 'courier-cash', label: 'Courier cash', icon: HandCoins, capability: 'courier-cash' },
    ],
  },
  {
    group: 'growth',
    label: 'Growth',
    items: [
      { id: 'pricing', label: 'Pricing', icon: BadgeDollarSign, capability: 'pricing' },
      { id: 'promotions', label: 'Promotions', icon: TicketPercent, capability: 'promotions' },
    ],
  },
  {
    group: 'admin',
    label: 'Admin',
    items: [
      { id: 'team', label: 'Team and access', icon: ShieldCheck, capability: 'team' },
      { id: 'audit', label: 'Audit log', icon: ScrollText, capability: 'audit' },
      { id: 'settings', label: 'Settings', icon: Settings, capability: 'settings' },
    ],
  },
];

export const DASH_ADMIN_CONFIG: AdminConfig = {
  product: 'dash',
  title: 'Roam Rush',
  subtitle: 'Ops',
  groups: NAV.map((group) => ({
    id: group.group,
    label: group.label,
    items: group.items.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      capability: item.capability,
    })),
  })),
  allowedRoles: ALLOWED_DASH_ADMIN_ROLES,
  backToAppUrl: '/',
  backToAppLabel: 'Back to Roam Rush',
};

export function filterConfigForRole(role: string | string[] | null | undefined): AdminConfig {
  const roles = Array.isArray(role) ? role : [role];
  return {
    ...DASH_ADMIN_CONFIG,
    groups: DASH_ADMIN_CONFIG.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canOpenCapabilityForRoles(roles, item.id as DashCapability)),
      }))
      .filter((group) => group.items.length > 0),
  };
}

export function applyNavBadges(
  config: AdminConfig,
  badges: Partial<Record<string, AdminNavBadge>>,
): AdminConfig {
  return {
    ...config,
    groups: config.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => (
        badges[item.id] ? { ...item, badge: badges[item.id] } : item
      )),
    })),
  };
}

/** Which sidebar item stays lit, including detail pages. */
export function pathnameToNavId(pathname: string): string {
  const path = pathname.split('?')[0] || '/';
  if (path === '/' || path === '' || path.startsWith('/dashboard')) return 'home';
  if (path.startsWith('/dispatch') || path.startsWith('/live-ops') || path.startsWith('/couriers/presence')) return 'dispatch';
  if (path.startsWith('/orders') || path.startsWith('/couriers/ledger')) return 'orders';
  if (path.startsWith('/support') || path.startsWith('/reviews')) return 'support';
  if (path.startsWith('/in-house')) return 'in-house';
  if (path.startsWith('/merchants')) return 'merchants';
  if (path.startsWith('/couriers')) return 'couriers';
  if (path.startsWith('/customers')) return 'customers';
  if (path.startsWith('/markets')) return 'markets';
  if (path.startsWith('/finance') || path.startsWith('/disputes') || path.startsWith('/reports')) return 'finance';
  if (path.startsWith('/courier-cash') || path.startsWith('/remittance')) return 'courier-cash';
  if (path.startsWith('/pricing')) return 'pricing';
  if (path.startsWith('/promotions')) return 'promotions';
  if (path.startsWith('/team') || path.startsWith('/users')) return 'team';
  if (path.startsWith('/audit') || path.startsWith('/activity')) return 'audit';
  if (path.startsWith('/settings') || path.startsWith('/play-store')) return 'settings';
  return 'home';
}

export function navIdToPath(navId: string): string {
  switch (navId) {
    case 'home':
    case 'dashboard':
      return '/';
    case 'dispatch':
    case 'live-ops':
      return '/dispatch';
    case 'orders':
      return '/orders';
    case 'support':
    case 'reviews':
      return '/support';
    case 'in-house':
    case 'in-house-team':
    case 'in-house-queue':
      return '/in-house';
    case 'in-house-exceptions':
      return '/in-house?tab=ops';
    case 'in-house-stores':
      return '/in-house?tab=stores';
    case 'in-house-menu':
      return '/in-house?tab=menu';
    case 'in-house-cards':
      return '/in-house?tab=cards';
    case 'in-house-reports':
      return '/in-house?tab=reports';
    case 'merchants':
    case 'merchants-applications':
      return '/merchants';
    case 'merchants-price-reviews':
      return '/merchants?tab=price-reviews';
    case 'merchants-business-types':
      return '/merchants?tab=business-types';
    case 'couriers':
    case 'couriers-compliance':
    case 'users-compliance':
      return navId === 'couriers' ? '/couriers' : '/couriers?tab=compliance';
    case 'couriers-presence':
      return '/dispatch?tab=map';
    case 'couriers-ledger':
      return '/orders?view=all&type=courier';
    case 'customers':
    case 'users-directory':
      return navId === 'customers' ? '/customers' : '/team?tab=all-users';
    case 'markets':
      return '/markets';
    case 'markets-boundaries':
      return '/markets?tab=boundaries';
    case 'markets-coverage-health':
      return '/markets?tab=health';
    case 'finance':
      return '/finance';
    case 'courier-cash':
    case 'remittance':
      return '/courier-cash';
    case 'pricing':
      return '/pricing';
    case 'promotions':
      return '/promotions';
    case 'team':
    case 'users-operators':
      return '/team?tab=operators';
    case 'users-merchant-staff':
      return '/team?tab=merchant-staff';
    case 'users-audit':
      return '/audit';
    case 'audit':
      return '/audit';
    case 'settings':
    case 'play-store':
      return navId === 'play-store' ? '/settings/platform/app-versions' : '/settings';
    default:
      return '/';
  }
}

export function breadcrumbsFor(pathname: string, search: string, detailLabel?: string | null): Array<{ label: string; to?: string }> {
  const params = new URLSearchParams(search);
  const id = pathnameToNavId(pathname);
  const item = DASH_ADMIN_CONFIG.groups.flatMap((group) => group.items).find((entry) => entry.id === id);
  const page = item?.label ?? 'Home';
  const crumbs: Array<{ label: string; to?: string }> = [{ label: page, to: navIdToPath(id) }];
  const tab = params.get('tab') || params.get('view');
  if (tab) {
    crumbs.push({ label: tab.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) });
  }
  const parts = pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  const detail = last && last !== parts[0] && !['boundaries', 'coverage-health', 'task'].includes(last) && parts.length > 1;
  if (detail && detailLabel) crumbs.push({ label: detailLabel });
  return crumbs;
}
