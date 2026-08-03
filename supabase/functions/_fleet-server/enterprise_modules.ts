/** Enterprise module catalog + effective resolution (Deno mirror of @roam/platform-settings). */

export const ENTERPRISE_MODULE_KEYS = [
  "shipments",
  "carriers",
  "clients",
  "rateCards",
  "suites",
  "mailboxPackages",
  "miamiScan",
  "manifests",
  "customsBoard",
  "hubStation",
  "fulfillmentDesk",
  "clientFleet",
  "dispatchBoard",
  "serviceZones",
  "opsInbox",
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
] as const;

export type EnterpriseModuleKey = (typeof ENTERPRISE_MODULE_KEYS)[number];

export const DEFAULT_ENTERPRISE_MODULES: Record<EnterpriseModuleKey, boolean> = {
  shipments: true,
  carriers: true,
  clients: true,
  rateCards: true,
  suites: true,
  mailboxPackages: true,
  miamiScan: true,
  manifests: true,
  customsBoard: true,
  hubStation: true,
  fulfillmentDesk: true,
  clientFleet: true,
  dispatchBoard: true,
  serviceZones: true,
  opsInbox: true,
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
};

export function resolveEffectiveModules(
  productLine: Record<string, unknown> | null | undefined,
  orgOverrides: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  const pl = (productLine || {}) as Record<string, boolean>;
  const org = (orgOverrides || {}) as Record<string, boolean>;
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
  const out: Record<string, boolean> = {};
  for (const key of ENTERPRISE_MODULE_KEYS) {
    if (key in (body as Record<string, unknown>)) {
      out[key] = Boolean((body as Record<string, unknown>)[key]);
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
