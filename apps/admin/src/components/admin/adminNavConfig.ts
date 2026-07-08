import {
  LayoutDashboard,
  Users,
  Shield,
  Car,
  UserCog,
  ClipboardList,
  Database,
  BarChart3,
  MapPin,
  Info,
  Globe,
  Zap,
  UserPlus,
  Megaphone,
  AlertTriangle,
  HardDrive,
  Inbox,
  Wrench,
  ShoppingCart,
  Gauge,
  KeyRound,
  ShieldAlert,
  Receipt,
  Utensils,
  Navigation,
  Radio,
  ExternalLink,
  Building2,
  Truck,
  Search,
  Store,
  Brain,
  Layers,
} from 'lucide-react';

export type NavChild = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  href?: string;
};

export const NAV_ITEMS = [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }];

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

export const FLEET_SETTINGS_CHILDREN: NavChild[] = [
  { id: 'fleet-settings-general', label: 'General', icon: Globe },
  { id: 'fleet-settings-features', label: 'Features', icon: Zap },
  { id: 'fleet-settings-registration', label: 'Registration', icon: UserPlus },
  { id: 'fleet-settings-security', label: 'Security', icon: Shield },
  { id: 'fleet-settings-announcements', label: 'Announcements', icon: Megaphone },
];

export const ENTERPRISE_SETTINGS_CHILDREN: NavChild[] = [
  { id: 'enterprise-settings-general', label: 'General', icon: Globe },
  { id: 'enterprise-settings-features', label: 'Features', icon: Zap },
  { id: 'enterprise-settings-registration', label: 'Registration', icon: UserPlus },
  { id: 'enterprise-settings-security', label: 'Security', icon: Shield },
  { id: 'enterprise-settings-announcements', label: 'Announcements', icon: Megaphone },
];

/** @deprecated Legacy IDs — use GLOBAL/FLEET/ENTERPRISE settings children */
export const SETTINGS_CHILDREN: NavChild[] = [
  { id: 'settings-general', label: 'General', icon: Globe },
  { id: 'settings-features', label: 'Features', icon: Zap },
  { id: 'settings-registration', label: 'Registration', icon: UserPlus },
  { id: 'settings-security', label: 'Security', icon: Shield },
  { id: 'settings-announcements', label: 'Announcements', icon: Megaphone },
  { id: 'settings-danger', label: 'Danger Zone', icon: AlertTriangle },
];

export const ROAM_ENTERPRISE_CHILDREN: NavChild[] = [
  { id: 'enterprise-overview', label: 'Overview', icon: BarChart3 },
  { id: 'enterprise-customers', label: 'Customer Accounts', icon: Users },
  { id: 'enterprise-team-members', label: 'Team Members', icon: UserCog },
  ...ENTERPRISE_SETTINGS_CHILDREN,
];

export const FUEL_MANAGEMENT_CHILDREN: NavChild[] = [
  { id: 'fuel-stations', label: 'Station Database', icon: Database },
  { id: 'fuel-analytics', label: 'Fuel Analytics', icon: BarChart3 },
];

export const TOLL_MANAGEMENT_CHILDREN: NavChild[] = [
  { id: 'toll-stations', label: 'Toll Database', icon: MapPin },
  { id: 'toll-info', label: 'Toll Info', icon: Info },
  { id: 'toll-live-monitor', label: 'Live Toll Monitor', icon: Radio },
];

export const VEHICLE_DATABASE_CHILDREN: NavChild[] = [
  { id: 'motor-vehicles', label: 'Motor Vehicles', icon: Car },
  { id: 'pending-motor-vehicles', label: 'Pending motor vehicles', icon: Inbox },
  { id: 'maintenance-templates', label: 'Maintenance templates', icon: Wrench },
  { id: 'parts-sourcing', label: 'Parts sourcing', icon: ShoppingCart },
];

export const ROAM_FLEET_CHILDREN: NavChild[] = [
  { id: 'fleet-overview', label: 'Overview', icon: BarChart3 },
  { id: 'fleet-customers', label: 'Customer Accounts', icon: Users },
  { id: 'fleet-team-members', label: 'Team Members', icon: UserCog },
  ...FLEET_SETTINGS_CHILDREN,
  { id: 'fleet-admin-link', label: 'Open Fleet Admin →', icon: ExternalLink, href: 'https://roamfleet.co/admin' },
];

export const ROAM_DASH_CHILDREN: NavChild[] = [
  { id: 'roam-dash-overview', label: 'Overview', icon: BarChart3 },
  { id: 'dash-merchants', label: 'Merchants', icon: Store },
  { id: 'roam-dash-admin-link', label: 'Open Dash Admin →', icon: ExternalLink, href: 'https://roamdash.co/admin' },
];

export const ROAM_RIDES_CHILDREN: NavChild[] = [
  { id: 'roam-rides-overview', label: 'Overview', icon: BarChart3 },
  { id: 'rides-users', label: 'User Management', icon: Users },
  { id: 'roam-rides-admin-link', label: 'Open Rides Admin →', icon: ExternalLink, href: 'https://roam-s.co/admin' },
];

export const ROAM_DRIVER_CHILDREN: NavChild[] = [
  { id: 'roam-driver-overview', label: 'Overview', icon: BarChart3 },
  { id: 'driver-users', label: 'User Management', icon: Users },
  { id: 'roam-driver-admin-link', label: 'Open Driver Admin →', icon: ExternalLink, href: 'https://roamdriver.co/admin' },
];

export const ROAM_HAUL_CHILDREN: NavChild[] = [
  { id: 'roam-haul-overview', label: 'Overview', icon: BarChart3 },
  { id: 'roam-haul-admin-link', label: 'Open Haul Admin →', icon: ExternalLink, href: 'https://roamhaul.co/admin' },
];

export const API_CENTER_CHILDREN: NavChild[] = [
  { id: 'api-center-overview', label: 'Overview', icon: Gauge },
  { id: 'api-center-usage', label: 'Usage & Costs', icon: BarChart3 },
  { id: 'api-center-keys', label: 'API Keys', icon: KeyRound },
  { id: 'api-center-budgets', label: 'Budgets & Limits', icon: ShieldAlert },
  { id: 'api-center-logs', label: 'Call Log', icon: ClipboardList },
  { id: 'api-center-billing', label: 'Provider Billing', icon: Receipt },
];

export const DATABASE_MANAGEMENT_ITEM = { id: 'db-management', label: 'Database Management', icon: Database };

const GLOBAL_SETTINGS_PAGES = GLOBAL_SETTINGS_CHILDREN.map((c) => c.id);
const FLEET_SETTINGS_PAGES = FLEET_SETTINGS_CHILDREN.map((c) => c.id);
const ENTERPRISE_SETTINGS_PAGES = ENTERPRISE_SETTINGS_CHILDREN.map((c) => c.id);
const LEGACY_SETTINGS_PAGES = SETTINGS_CHILDREN.map((c) => c.id);

const SHARED_PLATFORM_PAGES = [
  'dashboard',
  'platform-team',
  'matching-brain',
  'global-identity',
  'activity-log',
  'enterprise-overview',
  'enterprise-customers',
  'enterprise-team-members',
  'fleet-overview',
  'fleet-customers',
  'fleet-team-members',
  'driver-user-detail',
  'rider-user-detail',
  'roam-driver-overview',
  'driver-users',
  'roam-rides-overview',
  'rides-users',
  'roam-haul-overview',
  'roam-dash-overview',
  'dash-merchants',
  'fuel-stations',
  'fuel-analytics',
  'toll-stations',
  'toll-info',
  'toll-live-monitor',
  'motor-vehicles',
  'pending-motor-vehicles',
  'maintenance-templates',
  'parts-sourcing',
  ...GLOBAL_SETTINGS_PAGES,
  ...FLEET_SETTINGS_PAGES,
  ...ENTERPRISE_SETTINGS_PAGES,
];

export const PLATFORM_ROLE_PAGES: Record<string, string[]> = {
  platform_owner: [
    ...SHARED_PLATFORM_PAGES,
    'api-center',
    'api-center-overview',
    'api-center-usage',
    'api-center-keys',
    'api-center-budgets',
    'api-center-logs',
    'api-center-billing',
    'settings',
    ...LEGACY_SETTINGS_PAGES,
    'db-management',
    'db-settings',
    'unified-ledger',
  ],
  platform_support: [...SHARED_PLATFORM_PAGES],
  platform_analyst: [
    'dashboard',
    'api-center',
    'api-center-overview',
    'api-center-usage',
    'api-center-logs',
  ],
};

/** Legacy page IDs → new routes */
export const LEGACY_PAGE_REDIRECTS: Record<string, string> = {
  customers: 'enterprise-customers',
  'team-members': 'enterprise-team-members',
  drivers: 'driver-users',
  'roam-dash-merchants': 'dash-merchants',
  settings: 'global-settings-general',
  'settings-general': 'global-settings-general',
  'settings-features': 'fleet-settings-features',
  'settings-registration': 'fleet-settings-registration',
  'settings-security': 'global-settings-security',
  'settings-announcements': 'fleet-settings-announcements',
  'settings-danger': 'global-settings-danger',
};

export const SECTION_META = {
  platform: { label: 'Platform', icon: Shield },
  businessSegments: { label: 'Business Segments', icon: Layers },
  enterprise: { label: 'Roam Enterprise', icon: Building2 },
  fleet: { label: 'Roam Fleet', icon: Truck },
  dash: { label: 'Roam Dash', icon: Utensils },
  rides: { label: 'Roam Rides', icon: Navigation },
  haul: { label: 'Roam Haul', icon: Truck },
  driver: { label: 'Roam Driver', icon: Car },
} as const;

export function settingsTabFromPageId(pageId: string): string | null {
  if (pageId.startsWith('global-settings-')) return pageId.replace('global-settings-', '');
  if (pageId.startsWith('fleet-settings-')) return pageId.replace('fleet-settings-', '');
  if (pageId.startsWith('enterprise-settings-')) return pageId.replace('enterprise-settings-', '');
  if (pageId.startsWith('settings-')) return pageId.replace('settings-', '');
  return null;
}
