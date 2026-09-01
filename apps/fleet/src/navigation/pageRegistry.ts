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
  'supply-health': { id: 'supply-health', path: '/supply-health', permission: 'nav.supply_health' },
};

const PATH_TO_PAGE = Object.values(FLEET_PAGE_REGISTRY)
  .filter((def) => def.path !== '/')
  .sort((a, b) => b.path.length - a.path.length);

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
