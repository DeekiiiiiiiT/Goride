/** Enterprise module catalog + effective resolution (Deno mirror of @roam/platform-settings). */

export const LEGACY_MODULE_ALIASES: Record<string, string> = {
  shipments: "freight_shipments",
  carriers: "freight_carriers",
  clients: "freight_clients",
  rateCards: "freight_rate_cards",
  suites: "freight_suites",
  mailboxPackages: "freight_mailbox_packages",
  miamiScan: "freight_miami_scan",
  manifests: "freight_manifests",
  customsBoard: "freight_customs_board",
  hubStation: "freight_hub_station",
  fulfillmentDesk: "freight_fulfillment",
  clientFleet: "freight_client_fleet",
  dispatchBoard: "freight_dispatch",
  serviceZones: "freight_service_zones",
  opsInbox: "freight_ops_inbox",
};

export const ENTERPRISE_MODULE_KEYS = [
  "freight_shipments",
  "freight_carriers",
  "freight_clients",
  "freight_rate_cards",
  "freight_suites",
  "freight_mailbox_packages",
  "freight_miami_scan",
  "freight_manifests",
  "freight_customs_board",
  "freight_hub_station",
  "freight_fulfillment",
  "freight_client_fleet",
  "freight_dispatch",
  "freight_service_zones",
  "freight_ops_inbox",
  "freight_pipeline_command",
  "freight_invoice_audit",
  "freight_hs_tariffs",
  "freight_billing",
  "warehouse_inbound",
  "warehouse_receive",
  "warehouse_partner_links",
  "warehouse_storage_billing",
  "warehouse_bins",
  "grocery_catalog",
  "grocery_orders",
  "grocery_fulfillment",
  "fuelManagement",
  "tollManagement",
  "drivers",
  "vehicles",
  "fleetEquipment",
  "trips",
  "dataCenter",
  "reports",
  "businessFinance",
  "claimableLoss",
  "teamManagement",
  "driverPortal",
  "performanceAnalytics",
  "rush_couriers",
  "rush_deliveries",
  "rush_courier_settlements",
  "rush_supply_health",
  "rush_merchant_link",
] as const;

export const RUSH_MODULE_KEYS = [
  "rush_couriers",
  "rush_deliveries",
  "rush_courier_settlements",
  "rush_supply_health",
  "rush_merchant_link",
] as const;

/** Sync rush_* module keys from service_lines — RoamFleet is shared, not a Rush upsell. */
export function rushModuleOverridesForServiceLines(
  serviceLines: string[] | null | undefined,
  existing: Record<string, boolean> | null | undefined = null,
): Record<string, boolean> {
  const merged = { ...(existing ?? {}) };
  const hasRush = Array.isArray(serviceLines) && serviceLines.includes("rush_delivery");
  for (const key of RUSH_MODULE_KEYS) {
    merged[key] = hasRush;
  }
  return merged;
}

export type EnterpriseModuleKey = (typeof ENTERPRISE_MODULE_KEYS)[number];

export const DEFAULT_ENTERPRISE_MODULES: Record<EnterpriseModuleKey, boolean> = {
  freight_shipments: true,
  freight_carriers: true,
  freight_clients: true,
  freight_rate_cards: true,
  freight_suites: true,
  freight_mailbox_packages: true,
  freight_miami_scan: true,
  freight_manifests: true,
  freight_customs_board: true,
  freight_hub_station: true,
  freight_fulfillment: true,
  freight_client_fleet: true,
  freight_dispatch: true,
  freight_service_zones: true,
  freight_ops_inbox: true,
  freight_pipeline_command: true,
  freight_invoice_audit: true,
  freight_hs_tariffs: true,
  freight_billing: true,
  warehouse_inbound: true,
  warehouse_receive: true,
  warehouse_partner_links: true,
  warehouse_storage_billing: true,
  warehouse_bins: true,
  grocery_catalog: false,
  grocery_orders: false,
  grocery_fulfillment: false,
  fuelManagement: true,
  tollManagement: true,
  drivers: true,
  vehicles: true,
  fleetEquipment: true,
  trips: true,
  dataCenter: true,
  reports: true,
  businessFinance: true,
  claimableLoss: true,
  teamManagement: true,
  driverPortal: true,
  performanceAnalytics: true,
  rush_couriers: true,
  rush_deliveries: true,
  rush_courier_settlements: true,
  rush_supply_health: true,
  rush_merchant_link: true,
};

export function normalizeModuleKeyMap(
  raw: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  if (!raw) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "boolean") continue;
    const canonical = LEGACY_MODULE_ALIASES[key] ?? key;
    if (key in LEGACY_MODULE_ALIASES && canonical in raw) continue;
    out[canonical] = value;
  }
  return out;
}

export function resolveEffectiveModules(
  productLine: Record<string, unknown> | null | undefined,
  orgOverrides: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  const pl = normalizeModuleKeyMap(productLine);
  const org = normalizeModuleKeyMap(orgOverrides);
  const effective: Record<string, boolean> = {};
  for (const key of ENTERPRISE_MODULE_KEYS) {
    const lineOn = pl[key] !== false;
    const orgOn = org[key] !== false;
    effective[key] = lineOn && orgOn;
  }
  return effective;
}

export function sanitizeModuleOverrides(
  body: unknown,
): Record<string, boolean> | null {
  if (body === null) return null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("enabledModules must be an object or null");
  }
  const normalized = normalizeModuleKeyMap(body as Record<string, unknown>);
  const out: Record<string, boolean> = {};
  for (const key of ENTERPRISE_MODULE_KEYS) {
    if (key in normalized) {
      out[key] = Boolean(normalized[key]);
    }
  }
  return out;
}

/** All catalog keys explicitly false — fail-closed when modules cannot be loaded. */
export function allModulesOff(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of ENTERPRISE_MODULE_KEYS) {
    out[key] = false;
  }
  return out;
}
