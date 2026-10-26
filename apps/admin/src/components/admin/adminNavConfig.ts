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
  { id: 'fuel-prices', label: 'Prices', icon: DollarSign },
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
  { id: 'world-places', label: 'Places & pins', icon: MapPin },
  { id: 'world-imports', label: 'Imports & versions', icon: Layers },
  { id: 'world-quality', label: 'Data quality', icon: ClipboardCheck },
];

export const VEHICLE_DATABASE_CHILDREN: NavChild[] = [
  { id: 'motor-vehicles', label: 'Vehicle Catalog', icon: Car },
  { id: 'platforms-engines', label: 'Platforms & Engines', icon: Layers },
  { id: 'pending-motor-vehicles', label: 'Pending catalog', icon: Inbox },
  { id: 'maintenance-templates', label: 'Maintenance templates', icon: Wrench },
  { id: 'parts-catalog', label: 'Parts catalog', icon: ClipboardList },
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

/** Legacy page IDs → new routes */
export const LEGACY_PAGE_REDIRECTS: Record<string, string> = {
  customers: 'dashboard',
  'enterprise-customers': 'dashboard',
  'fleet-customers': 'dashboard',
  'team-members': 'dashboard',
  'enterprise-team-members': 'dashboard',
  'fleet-team-members': 'dashboard',
  drivers: 'dashboard',
  'driver-users': 'dashboard',
  'driver-user-detail': 'dashboard',
  'rides-users': 'dashboard',
  'rider-user-detail': 'dashboard',
  'dash-merchants': 'dashboard',
  'roam-dash-merchants': 'dashboard',
  'enterprise-overview': 'dashboard',
  'fleet-overview': 'dashboard',
  'roam-dash-overview': 'dashboard',
  'roam-rides-overview': 'dashboard',
  'roam-driver-overview': 'dashboard',
  'roam-haul-overview': 'dashboard',
  'db-management': 'dashboard',
  'db-settings': 'dashboard',
  'unified-ledger': 'dashboard',
  'fuel-cost-analytics': 'fuel-analytics',
  'fuel-evidence-bridge': 'fuel-analytics',
  'parts-sourcing': 'parts-catalog',
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
        activeWhen: ['world-jamaica', 'world-parishes', 'world-towns', 'world-communities', 'world-places', 'world-imports', 'world-quality', 'plug-places'],
      },
      {
        id: 'fuel-home',
        label: 'Fuel',
        icon: Fuel,
        activeWhen: ['fuel-stations', 'fuel-prices', 'fuel-analytics', 'fuel-jaa-cards'],
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
