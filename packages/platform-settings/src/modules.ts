/**
 * Enterprise sellable module catalog + effective-module resolution
 * (product-line defaults ∩ org overrides).
 */

import type { EnterpriseEnabledModules } from './types';
import { DEFAULT_ENTERPRISE_ENABLED_MODULES } from './defaults';

export type EnterpriseProductModules = EnterpriseEnabledModules;
export type ModuleKey = keyof EnterpriseProductModules;

export type ModuleCatalogEntry = {
  key: ModuleKey;
  label: string;
  description: string;
  group: 'freight' | 'grocery' | 'ops' | 'money' | 'people' | 'optional';
};

/** Legacy camelCase keys → freight_* (dual-read until stored JSON is migrated). */
export const LEGACY_MODULE_ALIASES: Readonly<Record<string, ModuleKey>> = {
  shipments: 'freight_shipments',
  carriers: 'freight_carriers',
  clients: 'freight_clients',
  rateCards: 'freight_rate_cards',
  suites: 'freight_suites',
  mailboxPackages: 'freight_mailbox_packages',
  miamiScan: 'freight_miami_scan',
  manifests: 'freight_manifests',
  customsBoard: 'freight_customs_board',
  hubStation: 'freight_hub_station',
  fulfillmentDesk: 'freight_fulfillment',
  clientFleet: 'freight_client_fleet',
  dispatchBoard: 'freight_dispatch',
  serviceZones: 'freight_service_zones',
  opsInbox: 'freight_ops_inbox',
};

/** Rewrite legacy keys in a module map onto canonical freight_* / grocery_* keys. */
export function normalizeModuleKeyMap(
  raw: Partial<Record<string, boolean>> | null | undefined,
): Partial<Record<string, boolean>> {
  if (!raw) return {};
  const out: Partial<Record<string, boolean>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'boolean') continue;
    const canonical = LEGACY_MODULE_ALIASES[key] ?? key;
    // Prefer explicit canonical over alias when both present
    if (key in LEGACY_MODULE_ALIASES && canonical in raw) continue;
    out[canonical] = value;
  }
  return out;
}

export const ENTERPRISE_MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  {
    key: 'freight_shipments',
    label: 'Shipments',
    description: 'Create and track freight shipments.',
    group: 'freight',
  },
  {
    key: 'freight_carriers',
    label: 'Carriers',
    description: 'Own fleet and 3PL carrier directory.',
    group: 'freight',
  },
  {
    key: 'freight_clients',
    label: 'Clients',
    description: 'Bill-to clients for freight jobs.',
    group: 'freight',
  },
  {
    key: 'freight_rate_cards',
    label: 'Rate Cards',
    description: 'Client and route pricing (JMD).',
    group: 'freight',
  },
  {
    key: 'freight_suites',
    label: 'Suites',
    description: 'US mailbox suite codes for end customers.',
    group: 'freight',
  },
  {
    key: 'freight_mailbox_packages',
    label: 'Packages',
    description: 'International mailbox parcels and custody timeline.',
    group: 'freight',
  },
  {
    key: 'freight_miami_scan',
    label: 'Warehouse Receive',
    description: 'Miami warehouse intake scanning station.',
    group: 'freight',
  },
  {
    key: 'freight_manifests',
    label: 'Manifests',
    description: 'Air/sea consolidation and broker export.',
    group: 'freight',
  },
  {
    key: 'freight_customs_board',
    label: 'Customs Board',
    description: 'Manual broker status mirror (ASYCUDA offline).',
    group: 'freight',
  },
  {
    key: 'freight_hub_station',
    label: 'Hub Station',
    description: 'Jamaica hub inbound scan and sort.',
    group: 'freight',
  },
  {
    key: 'freight_fulfillment',
    label: 'Fulfillment',
    description: 'Pickup tickets and mixed-fleet door delivery.',
    group: 'freight',
  },
  {
    key: 'freight_client_fleet',
    label: 'Client Fleet',
    description: 'Customer-owned drivers and vehicles.',
    group: 'freight',
  },
  {
    key: 'freight_dispatch',
    label: 'Dispatch Board',
    description: 'Domestic logistics job board — assign and track freight jobs.',
    group: 'freight',
  },
  {
    key: 'freight_service_zones',
    label: 'Service Zones',
    description: 'Draw service areas that gate bookings and support zone pricing.',
    group: 'freight',
  },
  {
    key: 'freight_ops_inbox',
    label: 'Ops Inbox',
    description: 'In-app alerts for matching failures, exceptions, and stale GPS.',
    group: 'freight',
  },
  {
    key: 'grocery_catalog',
    label: 'Grocery Catalog',
    description: 'Reserved — supermarket catalog (not enabled).',
    group: 'grocery',
  },
  {
    key: 'grocery_orders',
    label: 'Grocery Orders',
    description: 'Reserved — supermarket orders (not enabled).',
    group: 'grocery',
  },
  {
    key: 'grocery_fulfillment',
    label: 'Grocery Fulfillment',
    description: 'Reserved — supermarket fulfillment (not enabled).',
    group: 'grocery',
  },
  { key: 'fuelManagement', label: 'Fuel Management', description: 'Fuel spend, cards, and reconciliation.', group: 'ops' },
  { key: 'tollManagement', label: 'Toll Management', description: 'Toll logs, tags, and reconciliation.', group: 'ops' },
  { key: 'drivers', label: 'Drivers', description: 'Driver roster and analytics.', group: 'ops' },
  { key: 'vehicles', label: 'Vehicles', description: 'Vehicle roster, maintenance, and analytics.', group: 'ops' },
  { key: 'fleetEquipment', label: 'Fleet Equipment', description: 'Inventory and asset management.', group: 'ops' },
  { key: 'trips', label: 'Trips', description: 'Trip logs and activity.', group: 'ops' },
  {
    key: 'dataCenter',
    label: 'Data Center',
    description: 'Imports, data ingestion, and uploaded files library.',
    group: 'ops',
  },
  { key: 'reports', label: 'Reports', description: 'Operational and financial reports.', group: 'ops' },
  { key: 'businessFinance', label: 'Business Finance', description: 'P&L, expenses, and settlements.', group: 'money' },
  { key: 'claimableLoss', label: 'Claims', description: 'Cargo and underpaid claims.', group: 'money' },
  { key: 'teamManagement', label: 'Team Management', description: 'Invite and manage org staff.', group: 'people' },
  { key: 'driverPortal', label: 'Driver Portal', description: 'Field driver portal access.', group: 'optional' },
  { key: 'performanceAnalytics', label: 'Performance Analytics', description: 'Safety and efficiency KPIs.', group: 'optional' },
] as const;

export const ENTERPRISE_MODULE_KEYS: readonly ModuleKey[] = ENTERPRISE_MODULE_CATALOG.map(
  (e) => e.key,
);

/**
 * Intersection: a module is on only when product-line allows it AND
 * org override is not explicitly false. Missing org keys inherit product-line.
 * Accepts legacy camelCase keys via LEGACY_MODULE_ALIASES.
 */
export function resolveEffectiveModules(
  productLine: Partial<Record<string, boolean>> | null | undefined,
  orgOverrides: Partial<Record<string, boolean>> | null | undefined,
  catalogKeys: readonly string[] = ENTERPRISE_MODULE_KEYS,
): Record<string, boolean> {
  const pl = normalizeModuleKeyMap(productLine);
  const org = normalizeModuleKeyMap(orgOverrides);
  const effective: Record<string, boolean> = {};

  for (const key of catalogKeys) {
    const lineOn = pl[key] !== false;
    const orgOn = org[key] !== false;
    effective[key] = lineOn && orgOn;
  }

  return effective;
}

export function isModuleEnabled(
  effective: Record<string, boolean> | null | undefined,
  key: string,
): boolean {
  if (!effective) return true;
  const canonical = LEGACY_MODULE_ALIASES[key] ?? key;
  return effective[canonical] !== false;
}

export function defaultEnterpriseProductModules(): EnterpriseProductModules {
  return { ...DEFAULT_ENTERPRISE_ENABLED_MODULES };
}

/** All catalog keys explicitly false — fail-closed when modules cannot be loaded. */
export function allModulesOff(
  catalogKeys: readonly string[] = ENTERPRISE_MODULE_KEYS,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of catalogKeys) {
    out[key] = false;
  }
  return out;
}
