import type { Permission } from '../utils/permissions';

export interface FleetPageDef {
  id: string;
  path: string;
  permission?: Permission;
}

/** Path ↔ page id map for URL-based routing (no react-router). */
export const FLEET_PAGE_REGISTRY: Record<string, FleetPageDef> = {
  dashboard: { id: 'dashboard', path: '/' },
  imports: { id: 'imports', path: '/imports', permission: 'nav.imports' },
  drivers: { id: 'drivers', path: '/drivers', permission: 'nav.drivers' },
  'driver-analytics': { id: 'driver-analytics', path: '/driver-analytics', permission: 'nav.drivers' },
  vehicles: { id: 'vehicles', path: '/vehicles', permission: 'nav.vehicles' },
  trips: { id: 'trips', path: '/trips', permission: 'nav.trips' },
  reports: { id: 'reports', path: '/reports', permission: 'nav.reports' },
  settings: { id: 'settings', path: '/settings', permission: 'nav.settings' },
  couriers: { id: 'couriers', path: '/couriers', permission: 'nav.couriers' },
  'courier-analytics': { id: 'courier-analytics', path: '/courier-analytics', permission: 'nav.courier_analytics' },
  deliveries: { id: 'deliveries', path: '/deliveries', permission: 'nav.deliveries' },
  'delivery-analytics': { id: 'delivery-analytics', path: '/delivery-analytics', permission: 'nav.delivery_analytics' },
  'courier-settlements': { id: 'courier-settlements', path: '/courier-settlements', permission: 'nav.courier_settlements' },
  'driver-settlements': {
    id: 'driver-settlements',
    path: '/driver-settlements',
    permission: 'nav.financial_analytics',
  },
  'driver-payouts': {
    id: 'driver-payouts',
    path: '/driver-payouts',
    permission: 'nav.financial_analytics',
  },
  'close-week': {
    id: 'close-week',
    path: '/close-week',
    permission: 'nav.financial_analytics',
  },
  'supply-health': { id: 'supply-health', path: '/supply-health', permission: 'nav.supply_health' },
  'fuel-reconciliation': {
    id: 'fuel-reconciliation',
    path: '/fuel-reconciliation',
    permission: 'nav.fuel_overview',
  },
  'fuel-logs': { id: 'fuel-logs', path: '/fuel-logs', permission: 'nav.fuel_logs' },
  'fuel-cards': { id: 'fuel-cards', path: '/fuel-cards', permission: 'nav.fuel_overview' },
  'fuel-configuration': {
    id: 'fuel-configuration',
    path: '/fuel-configuration',
    permission: 'nav.fuel_overview',
  },
  'fuel-reimbursements': {
    id: 'fuel-reimbursements',
    path: '/fuel-reimbursements',
    permission: 'nav.fuel_overview',
  },
};

const PATH_TO_PAGE = Object.values(FLEET_PAGE_REGISTRY)
  .filter((def) => def.path !== '/')
  .sort((a, b) => b.path.length - a.path.length);

/** Driver detail tabs — path segment after `/drivers/:driverId`. */
export const DRIVER_DETAIL_TABS = [
  'overview',
  'financial',
  'quality',
  'wallet',
  'indrive-wallet',
  'profile',
] as const;

export type DriverDetailTab = (typeof DRIVER_DETAIL_TABS)[number];

export function isDriverDetailTab(value: string | undefined | null): value is DriverDetailTab {
  return !!value && (DRIVER_DETAIL_TABS as readonly string[]).includes(value);
}

export interface DriversPathParse {
  page: 'drivers';
  driverId?: string;
  tab?: DriverDetailTab;
}

/**
 * Parse `/drivers`, `/drivers/:driverId`, `/drivers/:driverId/:tab`.
 * Invalid tab segments are ignored (defaults to overview when an id is present).
 */
export function parseDriversPath(pathname: string): DriversPathParse {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/drivers') return { page: 'drivers' };
  if (!normalized.startsWith('/drivers/')) return { page: 'drivers' };

  const parts = normalized.slice('/drivers/'.length).split('/').filter(Boolean);
  const driverId = parts[0] ? decodeURIComponent(parts[0]) : undefined;
  if (!driverId) return { page: 'drivers' };

  const tabSeg = parts[1];
  if (isDriverDetailTab(tabSeg)) {
    return { page: 'drivers', driverId, tab: tabSeg };
  }
  return { page: 'drivers', driverId, tab: 'overview' };
}

/** `/drivers/:id` for overview; `/drivers/:id/:tab` for other tabs. */
export function pathForDriverDetail(driverId: string, tab?: string | null): string {
  const id = encodeURIComponent(driverId);
  if (tab && tab !== 'overview' && isDriverDetailTab(tab)) {
    return `/drivers/${id}/${tab}`;
  }
  return `/drivers/${id}`;
}

export function resolvePageFromPathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/') return 'dashboard';
  const match = PATH_TO_PAGE.find(
    (def) => normalized === def.path || normalized.startsWith(`${def.path}/`),
  );
  return match?.id ?? 'dashboard';
}

export function pathForPageId(pageId: string): string {
  return FLEET_PAGE_REGISTRY[pageId]?.path ?? '/';
}
