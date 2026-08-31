import {
  LayoutDashboard,
  Store,
  ClipboardList,
  Settings,
  Users,
  UserCircle,
  Wallet,
  HeadphonesIcon,
  Star,
  Layers,
  Smartphone,
  Radio,
  Truck,
  ShieldCheck,
  MapPin,
  ScrollText,
  Map,
  Activity,
  DollarSign,
  Tag,
  Library,
} from 'lucide-react';
import type { AdminConfig } from '@roam/admin-core';
import { isCourierOnlyRole } from '../utils/isCourierOnlyRole';

export const ALLOWED_DASH_ADMIN_ROLES = [
  'platform_owner',
  'platform_support',
  'platform_analyst',
  'superadmin',
  'dash_admin',
  'dash_ops',
  'courier_admin',
  'courier_ops',
];

/** Nav ids visible to courier-only roles (courier_admin / courier_ops) */
export const COURIER_ONLY_NAV_IDS = [
  'live-ops',
  'orders',
  'support',
  'users-directory',
  'couriers-compliance',
  'couriers-presence',
  'couriers-ledger',
];

export const DASH_ADMIN_CONFIG: AdminConfig = {
  product: 'dash',
  title: 'Roam Rush',
  subtitle: 'Ops Console',
  sections: [
    {
      id: 'merchants',
      label: 'Merchants',
      icon: Store,
      children: [],
      groups: [
        {
          id: 'merchants-onboarding',
          label: 'Onboarding',
          children: [
            { id: 'merchants-applications', label: 'Applications', icon: ClipboardList },
            { id: 'merchants-business-types', label: 'Business Types', icon: Layers },
          ],
        },
      ],
    },
    {
      id: 'couriers',
      label: 'Couriers',
      icon: Truck,
      children: [
        { id: 'couriers-compliance', label: 'Compliance', icon: ShieldCheck },
        { id: 'couriers-presence', label: 'Presence', icon: MapPin },
        { id: 'couriers-ledger', label: 'Delivery Ledger', icon: ScrollText },
      ],
    },
    {
      id: 'markets',
      label: 'Markets',
      icon: Map,
      children: [
        { id: 'markets', label: 'Delivery Markets', icon: Map },
        { id: 'markets-boundaries', label: 'Boundary Library', icon: Library },
        { id: 'markets-coverage-health', label: 'Coverage Health', icon: Activity },
      ],
    },
    {
      id: 'users',
      label: 'Users',
      icon: UserCircle,
      children: [
        { id: 'users-directory', label: 'Directory', icon: Users },
        { id: 'users-operators', label: 'Operators', icon: ShieldCheck },
        { id: 'users-merchant-staff', label: 'Merchant staff', icon: Store },
        { id: 'users-compliance', label: 'Compliance', icon: ShieldCheck },
        { id: 'users-audit', label: 'Audit', icon: Activity },
      ],
    },
  ],
  topNavItems: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'live-ops', label: 'Live Ops', icon: Radio },
    { id: 'orders', label: 'Orders', icon: ClipboardList },
    { id: 'finance', label: 'Finance', icon: Wallet },
    { id: 'promotions', label: 'Promotions', icon: Tag },
    { id: 'pricing', label: 'Pricing', icon: DollarSign },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'support', label: 'Support', icon: HeadphonesIcon },
    { id: 'play-store', label: 'Play Store', icon: Smartphone },
    { id: 'settings', label: 'Platform Settings', icon: Settings },
  ],
  allowedRoles: ALLOWED_DASH_ADMIN_ROLES,
  pinSectionsAfter: 'dashboard',
  backToAppUrl: '/',
  backToAppLabel: 'Back to Roam Rush',
};

/** Top nav ids a courier-only role may see */
const COURIER_ALLOWED_TOP_NAV = new Set(['dashboard', 'live-ops', 'orders', 'support', 'settings', 'play-store']);

/** Section ids a courier-only role may see */
const COURIER_ALLOWED_SECTIONS = new Set(['couriers', 'users']);

/** Child nav ids courier-only roles may see under allowed sections */
const COURIER_ALLOWED_SECTION_CHILD_IDS = new Set([
  'users-directory',
  'couriers-compliance',
  'couriers-presence',
  'couriers-ledger',
]);

/**
 * Return a config scoped to the given role. Courier-only roles (courier_admin /
 * courier_ops) get a reduced console: Couriers, Users Directory, Orders, Support, Live Ops.
 * Platform + dash roles get the full config unchanged.
 */
export function filterConfigForRole(role: string | null | undefined): AdminConfig {
  if (!isCourierOnlyRole(role)) return DASH_ADMIN_CONFIG;
  return {
    ...DASH_ADMIN_CONFIG,
    sections: DASH_ADMIN_CONFIG.sections
      .filter((s) => COURIER_ALLOWED_SECTIONS.has(s.id))
      .map((s) => ({
        ...s,
        children: (s.children ?? []).filter((c) => COURIER_ALLOWED_SECTION_CHILD_IDS.has(c.id)),
      })),
    topNavItems: (DASH_ADMIN_CONFIG.topNavItems ?? []).filter((i) =>
      COURIER_ALLOWED_TOP_NAV.has(i.id),
    ),
    pinSectionsAfter: undefined,
  };
}

/** Map pathname to AdminShell nav id */
export function pathnameToNavId(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'dashboard';
  if (pathname.startsWith('/live-ops')) return 'live-ops';
  if (pathname.startsWith('/merchants/onboarding/business-types')) return 'merchants-business-types';
  if (pathname.startsWith('/merchants')) return 'merchants-applications';
  if (pathname.startsWith('/orders')) return 'orders';
  if (pathname.startsWith('/couriers/compliance')) return 'couriers-compliance';
  if (pathname.startsWith('/couriers/presence')) return 'couriers-presence';
  if (pathname.startsWith('/couriers/ledger')) return 'couriers-ledger';
  // Legacy /couriers list redirects to unified Users Directory
  if (pathname.startsWith('/couriers')) return 'users-directory';
  if (pathname.startsWith('/customers')) return 'users-directory';
  if (pathname.startsWith('/markets/boundaries')) return 'markets-boundaries';
  if (pathname.startsWith('/markets/coverage-health')) return 'markets-coverage-health';
  if (pathname.startsWith('/markets')) return 'markets';
  if (pathname.startsWith('/users/compliance')) return 'users-compliance';
  if (pathname.startsWith('/users/merchant-staff')) return 'users-merchant-staff';
  if (pathname.startsWith('/users/operators') || pathname.startsWith('/team')) return 'users-operators';
  if (pathname.startsWith('/users/audit') || pathname.startsWith('/activity')) return 'users-audit';
  if (pathname.startsWith('/users')) return 'users-directory';
  if (pathname.startsWith('/finance') || pathname.startsWith('/disputes')) return 'finance';
  if (pathname.startsWith('/promotions')) return 'promotions';
  if (pathname.startsWith('/pricing')) return 'pricing';
  if (pathname.startsWith('/reviews')) return 'reviews';
  if (pathname.startsWith('/support')) return 'support';
  if (pathname.startsWith('/play-store')) return 'play-store';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'dashboard';
}

/** Map AdminShell nav id to route path */
export function navIdToPath(navId: string): string {
  switch (navId) {
    case 'dashboard':
      return '/';
    case 'live-ops':
      return '/live-ops';
    case 'merchants-applications':
      return '/merchants/onboarding/applications';
    case 'merchants-business-types':
      return '/merchants/onboarding/business-types';
    case 'orders':
      return '/orders';
    case 'couriers-compliance':
      return '/users/compliance';
    case 'couriers-presence':
      return '/couriers/presence';
    case 'couriers-ledger':
      return '/couriers/ledger';
    case 'markets':
      return '/markets';
    case 'markets-boundaries':
      return '/markets/boundaries';
    case 'markets-coverage-health':
      return '/markets/coverage-health';
    case 'users-directory':
      return '/users';
    case 'users-operators':
      return '/users/operators';
    case 'users-merchant-staff':
      return '/users/merchant-staff';
    case 'users-compliance':
      return '/users/compliance';
    case 'users-audit':
      return '/users/audit';
    case 'customers':
      return '/users?persona=customer';
    case 'finance':
      return '/finance';
    case 'promotions':
      return '/promotions';
    case 'pricing':
      return '/pricing';
    case 'reviews':
      return '/reviews';
    case 'support':
      return '/support';
    case 'play-store':
      return '/play-store';
    case 'settings':
      return '/settings';
    default:
      return '/';
  }
}
