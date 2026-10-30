import {
  LayoutDashboard,
  Shield,
  Car,
  ClipboardList,
  Database,
  BarChart3,
  MapPin,
  Info,
  Globe,
  AlertTriangle,
  Inbox,
  Wrench,
  Layers,
  ClipboardCheck,
  Gauge,
  KeyRound,
  ShieldAlert,
  Receipt,
  Settings,
  Search,
  Store,
  Brain,
  ShieldCheck,
  DollarSign,
  CreditCard,
  Scale,
  Percent,
  BadgeCheck,
  BookOpen,
  BookMarked,
  Fuel,
  AppWindow,
} from 'lucide-react';

export type NavChild = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  href?: string;
  /** Optional live badge (e.g. open pending count). */
  badgeCount?: number;
  /** Other page ids that should highlight this menu item. */
  activeWhen?: string[];
};

export const NAV_ITEMS = [{ id: 'dashboard', label: 'Overview', icon: LayoutDashboard }];

export const PLATFORM_CHILDREN: NavChild[] = [
  { id: 'platform-team', label: 'Platform Team', icon: Shield },
  { id: 'matching-brain', label: 'Matching Brain', icon: Brain },
  { id: 'global-identity', label: 'Global Identity Search', icon: Search },
  { id: 'activity-log', label: 'Activity Log', icon: ClipboardList },
];

export const GLOBAL_SETTINGS_CHILDREN: NavChild[] = [
  { id: 'global-settings-general', label: 'General', icon: Globe },
  { id: 'global-settings-security', label: 'Security', icon: Shield },
  { id: 'global-settings-danger', label: 'Danger Zone', icon: AlertTriangle },
];

export const FUEL_MANAGEMENT_CHILDREN: NavChild[] = [
  { id: 'fuel-jaa-cards', label: 'JAA Gas Cards', icon: CreditCard },
  { id: 'fuel-brain', label: 'Fuel Brain', icon: Brain },
  { id: 'fuel-prices', label: 'Refineries', icon: DollarSign },
  { id: 'fuel-price-engine', label: 'Price Engine', icon: DollarSign },
  { id: 'fuel-stations', label: 'Station Database', icon: Database },
  { id: 'plug-places', label: 'Places Review', icon: MapPin },
  { id: 'fuel-analytics', label: 'Station Analytics', icon: BarChart3 },
];

export const TOLL_MANAGEMENT_CHILDREN: NavChild[] = [
  { id: 'toll-brain', label: 'Toll Brain', icon: Brain },
  { id: 'toll-stations', label: 'Toll Database', icon: MapPin },
  { id: 'toll-info', label: 'Toll Info', icon: Info },
  { id: 'toll-settings', label: 'Toll Settings', icon: Settings },
];

export const WORLD_MAPS_CHILDREN: NavChild[] = [
  { id: 'world-jamaica', label: 'Jamaica map', icon: MapPin },
  { id: 'world-parishes', label: 'Parishes', icon: MapPin },
  { id: 'world-towns', label: 'Towns', icon: MapPin },
  { id: 'world-communities', label: 'Communities', icon: MapPin },
  { id: 'world-places', label: 'Places', icon: MapPin },
  { id: 'world-imports', label: 'Imports', icon: Layers },
  { id: 'world-quality', label: 'Data quality', icon: ClipboardCheck },
  { id: 'places-register', label: 'Places register', icon: MapPin },
  { id: 'places-categories', label: 'Categories', icon: Layers },
  { id: 'places-review', label: 'Review', icon: Inbox },
];

export const VEHICLE_DATABASE_CHILDREN: NavChild[] = [
  { id: 'motor-vehicles', label: 'Vehicle Catalog', icon: Car },
  { id: 'pending-motor-vehicles', label: 'Pending catalog', icon: Inbox },
  { id: 'maintenance-templates', label: 'Maintenance templates', icon: Wrench },
  { id: 'parts-catalog', label: 'Parts database', icon: ClipboardList },
  { id: 'suppliers-prices', label: 'Suppliers & prices', icon: Store },
  { id: 'catalog-quality', label: 'Data quality', icon: ClipboardCheck },
];

export const GCT_CHILDREN: NavChild[] = [
  { id: 'gct-engine', label: 'Engine', icon: Scale },
  { id: 'gct-rates', label: 'Rates & classes', icon: Percent },
  { id: 'gct-entities', label: 'Registrations', icon: BadgeCheck },
  { id: 'gct-ledger', label: 'Ledger', icon: BookOpen },
  { id: 'gct-remittance', label: 'Remittance & filing', icon: Receipt },
  { id: 'gct-knowledge', label: 'Knowledge base', icon: BookMarked },
];

/** Vendor catalog under Accounting — supports expenses / input-tax suppliers, not the GCT engine. */
export const ACCOUNTING_VENDOR_CHILDREN: NavChild[] = [
  { id: 'vendor-database', label: 'Vendors & categories', icon: Store },
  { id: 'pending-vendor-requests', label: 'Pending vendor requests', icon: Inbox },
];

export const API_CENTER_CHILDREN: NavChild[] = [
  { id: 'api-center-overview', label: 'Overview', icon: Gauge },
  { id: 'api-center-usage', label: 'Usage & Costs', icon: BarChart3 },
  { id: 'api-center-supabase', label: 'Supabase Platform', icon: Database },
  { id: 'api-center-keys', label: 'API Keys', icon: KeyRound },
  { id: 'api-center-budgets', label: 'Budgets & Limits', icon: ShieldAlert },
  { id: 'api-center-logs', label: 'Call Log', icon: ClipboardList },
  { id: 'api-center-billing', label: 'Provider Billing', icon: Receipt },
];

const GLOBAL_SETTINGS_PAGES = GLOBAL_SETTINGS_CHILDREN.map((c) => c.id);

/** Roam's own tax books. Owner only. */
const OWNER_ONLY_PAGES = [
  'global-identity',
  'activity-log',
  'platform-team',
  'gct-entities',
  'gct-ledger',
  'gct-remittance',
];

const SHARED_PLATFORM_PAGES = [
  'dashboard',
  'vehicles-home',
  'places-home',
  'fuel-home',
  'tolls-home',
  'tax-vendors-home',
  'apps-directory',
  'change-requests',
  'platform-ops',
  'matching-brain',
  'fuel-jaa-cards',
  'fuel-brain',
  'fuel-prices',
  'fuel-price-engine',
  'fuel-stations',
  'fuel-analytics',
  'plug-places',
  'toll-brain',
  'toll-stations',
  'toll-info',
  'toll-settings',
  'motor-vehicles',
  'platforms-engines',
  'pending-motor-vehicles',
  'maintenance-templates',
  'parts-catalog',
  'suppliers-prices',
  'catalog-quality',
  'world-jamaica',
  'world-parishes',
  'world-towns',
  'world-communities',
  'world-places',
  'world-imports',
  'world-quality',
  'places-register',
  'places-categories',
  'places-review',
  'gct-engine',
  'gct-rates',
  'gct-knowledge',
  'vendor-database',
  'pending-vendor-requests',
  ...GLOBAL_SETTINGS_PAGES,
];

export function pageAllowedForRole(role: string | null | undefined, pageId: string): boolean {
  if (role === 'platform_owner') {
    const ownerPages = PLATFORM_ROLE_PAGES.platform_owner ?? [];
    return ownerPages.includes(pageId);
  }
  const allowed = (role && PLATFORM_ROLE_PAGES[role]) || [];
  return allowed.includes(pageId);
}

export const PLATFORM_ROLE_PAGES: Record<string, string[]> = {
  platform_owner: [
    ...SHARED_PLATFORM_PAGES,
    ...OWNER_ONLY_PAGES,
    'api-center',
    'api-center-overview',
    'api-center-usage',
    'api-center-supabase',
    'api-center-keys',
    'api-center-budgets',
    'api-center-logs',
    'api-center-billing',
  ],
  platform_support: [...SHARED_PLATFORM_PAGES],
  platform_analyst: [
    'dashboard',
    ...SHARED_PLATFORM_PAGES,
    'api-center',
    'api-center-overview',
    'api-center-usage',
    'api-center-supabase',
    'api-center-logs',
  ],
};

/** Pages that left Dominion for a product admin. */
export const MOVED_PAGES: Record<string, { title: string; appName?: string; href?: string }> = {
  customers: { title: 'Customers', appName: 'Fleet admin', href: 'https://roamfleet.co/admin' },
  'fleet-customers': { title: 'Fleet customers', appName: 'Fleet admin', href: 'https://roamfleet.co/admin' },
  'team-members': { title: 'Team members', appName: 'Fleet admin', href: 'https://roamfleet.co/admin' },
  'fleet-team-members': { title: 'Fleet team', appName: 'Fleet admin', href: 'https://roamfleet.co/admin' },
  'fleet-overview': { title: 'Fleet overview', appName: 'Fleet admin', href: 'https://roamfleet.co/admin' },
  'unified-ledger': { title: 'Unified ledger', appName: 'Fleet admin', href: 'https://roamfleet.co/admin' },
  'enterprise-customers': { title: 'Enterprise customers', appName: 'Enterprise admin', href: 'https://roamenterprise.co/admin' },
  'enterprise-team-members': { title: 'Enterprise team', appName: 'Enterprise admin', href: 'https://roamenterprise.co/admin' },
  'enterprise-overview': { title: 'Enterprise overview', appName: 'Enterprise admin', href: 'https://roamenterprise.co/admin' },
  drivers: { title: 'Drivers', appName: 'Driver admin', href: 'https://roamdriver.co/admin' },
  'driver-users': { title: 'Driver users', appName: 'Driver admin', href: 'https://roamdriver.co/admin' },
  'driver-user-detail': { title: 'Driver user', appName: 'Driver admin', href: 'https://roamdriver.co/admin' },
  'roam-driver-overview': { title: 'Driver overview', appName: 'Driver admin', href: 'https://roamdriver.co/admin' },
  'rides-users': { title: 'Rides users', appName: 'Rides admin', href: 'https://roam-s.co/admin' },
  'rider-user-detail': { title: 'Rider', appName: 'Rides admin', href: 'https://roam-s.co/admin' },
  'roam-rides-overview': { title: 'Rides overview', appName: 'Rides admin', href: 'https://roam-s.co/admin' },
  'dash-merchants': { title: 'Merchants', appName: 'Dash admin', href: 'https://roamrush.app/admin' },
  'roam-dash-merchants': { title: 'Merchants', appName: 'Dash admin', href: 'https://roamrush.app/admin' },
  'roam-dash-overview': { title: 'Dash overview', appName: 'Dash admin', href: 'https://roamrush.app/admin' },
  'roam-haul-overview': { title: 'Haul overview', appName: 'Haul admin', href: 'https://roamhaul.co/admin' },
  'db-management': { title: 'Database management' },
  'db-settings': { title: 'Database settings' },
};

/** Legacy page IDs that still live inside Dominion. */
export const LEGACY_PAGE_REDIRECTS: Record<string, string> = {
  'fuel-cost-analytics': 'fuel-analytics',
  'fuel-evidence-bridge': 'fuel-analytics',
  'fuel-refineries': 'fuel-prices',
  'parts-sourcing': 'parts-catalog',
  'platforms-engines': 'parts-catalog',
  settings: 'global-settings-general',
  'settings-general': 'global-settings-general',
  'settings-features': 'global-settings-general',
  'settings-registration': 'global-settings-general',
  'settings-security': 'global-settings-security',
  'settings-announcements': 'global-settings-general',
  'settings-danger': 'global-settings-danger',
  'expense-categories': 'vendor-database',
  'fuel-silent-attach': 'fuel-stations',
  'toll-analytics': 'toll-stations',
  'toll-logs': 'toll-stations',
  'tag-inventory': 'toll-stations',
  'toll-tags': 'toll-stations',
  'toll-live-monitor': 'toll-stations',
};

/** Two-level Dominion menu. Customer apps are not listed here. */
export const DOMINION_SECTIONS: { id: string; label: string; icon: typeof LayoutDashboard; children: NavChild[] }[] = [
  {
    id: 'master',
    label: 'Master data',
    icon: Database,
    children: [
      {
        id: 'vehicles-home',
        label: 'Vehicles',
        icon: Car,
        activeWhen: ['motor-vehicles', 'platforms-engines', 'pending-motor-vehicles', 'maintenance-templates', 'parts-catalog', 'suppliers-prices', 'catalog-quality'],
      },
      {
        id: 'places-home',
        label: 'Places and Maps',
        icon: MapPin,
        activeWhen: ['world-jamaica', 'world-parishes', 'world-towns', 'world-communities', 'world-places', 'world-imports', 'world-quality', 'plug-places', 'places-register', 'places-categories', 'places-review'],
      },
      {
        id: 'fuel-home',
        label: 'Fuel',
        icon: Fuel,
        activeWhen: ['fuel-stations', 'fuel-prices', 'fuel-price-engine', 'fuel-analytics', 'fuel-jaa-cards'],
      },
      {
        id: 'tolls-home',
        label: 'Tolls',
        icon: MapPin,
        activeWhen: ['toll-stations', 'toll-info'],
      },
      {
        id: 'tax-vendors-home',
        label: 'Tax and Vendors',
        icon: Store,
        activeWhen: ['vendor-database', 'pending-vendor-requests', 'gct-engine', 'gct-rates', 'gct-knowledge'],
      },
    ],
  },
  {
    id: 'engines',
    label: 'Engines',
    icon: Brain,
    children: [
      { id: 'fuel-brain', label: 'Fuel Brain', icon: Brain },
      { id: 'toll-brain', label: 'Toll Brain', icon: Brain, activeWhen: ['toll-settings'] },
      { id: 'matching-brain', label: 'Matching Brain', icon: Brain },
    ],
  },
  {
    id: 'distribution',
    label: 'Distribution',
    icon: AppWindow,
    children: [
      { id: 'apps-directory', label: 'Apps', icon: AppWindow },
      {
        id: 'api-center-overview',
        label: 'Data API',
        icon: Gauge,
        activeWhen: ['api-center', 'api-center-usage', 'api-center-supabase', 'api-center-keys', 'api-center-budgets', 'api-center-logs', 'api-center-billing'],
      },
      { id: 'change-requests', label: 'Change requests', icon: Inbox },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    icon: Shield,
    children: [
      { id: 'platform-team', label: 'Staff and roles', icon: Shield },
      { id: 'activity-log', label: 'Activity log', icon: ClipboardList },
      { id: 'platform-ops', label: 'Platform Ops', icon: ShieldCheck },
      {
        id: 'global-settings-general',
        label: 'Global settings',
        icon: Globe,
        activeWhen: ['global-settings-security', 'global-settings-danger', 'settings'],
      },
    ],
  },
  {
    id: 'back-office',
    label: 'Back office',
    icon: Scale,
    children: [
      { id: 'gct-entities', label: 'GCT registrations', icon: BadgeCheck },
      { id: 'gct-ledger', label: 'Ledger', icon: BookOpen },
      { id: 'gct-remittance', label: 'Remittance', icon: Receipt },
    ],
  },
];

export function settingsTabFromPageId(pageId: string): string | null {
  if (pageId.startsWith('global-settings-')) return pageId.replace('global-settings-', '');
  return null;
}
