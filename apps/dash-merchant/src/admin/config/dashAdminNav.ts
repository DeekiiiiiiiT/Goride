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
} from 'lucide-react';
import type { AdminConfig } from '@roam/admin-core';

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
  'couriers',
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
        { id: 'couriers', label: 'Directory', icon: Users },
        { id: 'couriers-compliance', label: 'Compliance', icon: ShieldCheck },
        { id: 'couriers-presence', label: 'Presence', icon: MapPin },
        { id: 'couriers-ledger', label: 'Delivery Ledger', icon: ScrollText },
      ],
    },
    {
      id: 'markets',
      label: 'Markets',
      icon: Map,
      children: [{ id: 'markets', label: 'Delivery Markets', icon: Map }],
    },
    {
      id: 'team',
      label: 'Team',
      icon: Users,
      children: [
        { id: 'team', label: 'Team Members', icon: Users },
        { id: 'activity', label: 'Activity Log', icon: Activity },
      ],
    },
  ],
  topNavItems: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'live-ops', label: 'Live Ops', icon: Radio },
    { id: 'orders', label: 'Orders', icon: ClipboardList },
    { id: 'customers', label: 'Customers', icon: UserCircle },
    { id: 'finance', label: 'Finance', icon: Wallet },
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

/** Courier-only admin roles that see a reduced console */
const COURIER_ONLY_ROLES = new Set(['courier_admin', 'courier_ops']);

/** Top nav ids a courier-only role may see */
const COURIER_ALLOWED_TOP_NAV = new Set(['live-ops', 'orders', 'support']);

/** Section ids a courier-only role may see */
const COURIER_ALLOWED_SECTIONS = new Set(['couriers']);

/**
 * Return a config scoped to the given role. Courier-only roles (courier_admin /
 * courier_ops) get a reduced console: Couriers, Orders, Support, Live Ops.
 * Platform + dash roles get the full config unchanged.
 */
export function filterConfigForRole(role: string | null | undefined): AdminConfig {
  if (!role || !COURIER_ONLY_ROLES.has(role)) return DASH_ADMIN_CONFIG;
  return {
    ...DASH_ADMIN_CONFIG,
    sections: DASH_ADMIN_CONFIG.sections.filter((s) => COURIER_ALLOWED_SECTIONS.has(s.id)),
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
  if (pathname.startsWith('/couriers')) return 'couriers';
  if (pathname.startsWith('/customers')) return 'customers';
  if (pathname.startsWith('/markets')) return 'markets';
  if (pathname.startsWith('/team') || pathname.startsWith('/users')) return 'team';
  if (pathname.startsWith('/activity')) return 'activity';
  if (pathname.startsWith('/finance') || pathname.startsWith('/disputes')) return 'finance';
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
    case 'couriers':
      return '/couriers';
    case 'couriers-compliance':
      return '/couriers/compliance';
    case 'couriers-presence':
      return '/couriers/presence';
    case 'couriers-ledger':
      return '/couriers/ledger';
    case 'customers':
      return '/customers';
    case 'markets':
      return '/markets';
    case 'team':
      return '/team';
    case 'activity':
      return '/activity';
    case 'finance':
      return '/finance';
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
