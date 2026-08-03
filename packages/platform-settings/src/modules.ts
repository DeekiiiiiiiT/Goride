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
  group: 'freight' | 'ops' | 'money' | 'people' | 'optional';
};

export const ENTERPRISE_MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  { key: 'shipments', label: 'Shipments', description: 'Create and track freight shipments.', group: 'freight' },
  { key: 'carriers', label: 'Carriers', description: 'Own fleet and 3PL carrier directory.', group: 'freight' },
  { key: 'clients', label: 'Clients', description: 'Bill-to clients for freight jobs.', group: 'freight' },
  { key: 'rateCards', label: 'Rate Cards', description: 'Client and route pricing (JMD).', group: 'freight' },
  { key: 'suites', label: 'Suites', description: 'US mailbox suite codes for end customers.', group: 'freight' },
  {
    key: 'mailboxPackages',
    label: 'Packages',
    description: 'International mailbox parcels and custody timeline.',
    group: 'freight',
  },
  {
    key: 'miamiScan',
    label: 'Warehouse Receive',
    description: 'Miami warehouse intake scanning station.',
    group: 'freight',
  },
  {
    key: 'manifests',
    label: 'Manifests',
    description: 'Air/sea consolidation and broker export.',
    group: 'freight',
  },
  {
    key: 'customsBoard',
    label: 'Customs Board',
    description: 'Manual broker status mirror (ASYCUDA offline).',
    group: 'freight',
  },
  {
    key: 'hubStation',
    label: 'Hub Station',
    description: 'Jamaica hub inbound scan and sort.',
    group: 'freight',
  },
  {
    key: 'fulfillmentDesk',
    label: 'Fulfillment',
    description: 'Pickup tickets and mixed-fleet door delivery.',
    group: 'freight',
  },
  {
    key: 'clientFleet',
    label: 'Client Fleet',
    description: 'Customer-owned drivers and vehicles.',
    group: 'freight',
  },
  {
    key: 'dispatchBoard',
    label: 'Dispatch Board',
    description: 'Domestic logistics job board — assign and track freight jobs.',
    group: 'ops',
  },
  {
    key: 'serviceZones',
    label: 'Service Zones',
    description: 'Draw service areas that gate bookings and support zone pricing.',
    group: 'ops',
  },
  {
    key: 'opsInbox',
    label: 'Ops Inbox',
    description: 'In-app alerts for matching failures, exceptions, and stale GPS.',
    group: 'ops',
  },
  { key: 'fuelManagement', label: 'Fuel Management', description: 'Fuel spend, cards, and reconciliation.', group: 'ops' },
  { key: 'tollManagement', label: 'Toll Management', description: 'Toll logs, tags, and reconciliation.', group: 'ops' },
  { key: 'drivers', label: 'Drivers', description: 'Driver roster and analytics.', group: 'ops' },
  { key: 'vehicles', label: 'Vehicles', description: 'Vehicle roster, maintenance, and analytics.', group: 'ops' },
  { key: 'fleetEquipment', label: 'Fleet Equipment', description: 'Inventory and asset management.', group: 'ops' },
  { key: 'trips', label: 'Trips', description: 'Trip logs and activity.', group: 'ops' },
  { key: 'dataCenter', label: 'Data Center', description: 'Imports and data ingestion.', group: 'ops' },
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
 */
export function resolveEffectiveModules(
  productLine: Partial<Record<string, boolean>> | null | undefined,
  orgOverrides: Partial<Record<string, boolean>> | null | undefined,
  catalogKeys: readonly string[] = ENTERPRISE_MODULE_KEYS,
): Record<string, boolean> {
  const pl = productLine || {};
  const org = orgOverrides || {};
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
  return effective[key] !== false;
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
