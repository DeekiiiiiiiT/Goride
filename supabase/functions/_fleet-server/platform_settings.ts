/**
 * Platform settings resolution — dual-read from segment KV + legacy fallback.
 * Keep in sync with @roam/platform-settings package defaults.
 */
import type { Context } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import * as memCache from "./memory_cache.ts";
import { resolveProductLine, type ProductLine } from "./product_line.ts";
import { isPlatformStaffFromAuthUser } from "./rbac_middleware.ts";
import { requireProductAdmin, type FleetProductKey } from "./product_admin_guard.ts";

export type SettingsSegment =
  | "global"
  | "fleet"
  | "enterprise"
  | "rides"
  | "driver"
  | "haul"
  | "dash";

export const LEGACY_PLATFORM_SETTINGS_KEY = "platform:settings";

export const ALL_SETTINGS_SEGMENTS: SettingsSegment[] = [
  "global",
  "fleet",
  "enterprise",
  "rides",
  "driver",
  "haul",
  "dash",
];

export function platformSettingsKvKey(segment: SettingsSegment): string {
  return `platform:settings:${segment}`;
}

const DEFAULT_SECURITY = {
  minPasswordLength: 8,
  requireUppercase: false,
  requireNumber: false,
  requireSpecialChar: false,
  sessionTimeoutMinutes: 0,
  maxLoginAttempts: 0,
  lockoutDurationMinutes: 15,
};

const DEFAULT_ANNOUNCEMENT = {
  enabled: false,
  message: "",
  type: "info" as const,
  startDate: null as string | null,
  endDate: null as string | null,
  dismissible: true,
};

const DEFAULT_MODULES = {
  fuelManagement: true,
  tollManagement: true,
  driverPortal: true,
  fleetEquipment: true,
  claimableLoss: true,
  performanceAnalytics: true,
};

function fleetBusinessTypes(rideshareOnly: boolean): Record<string, boolean> {
  if (rideshareOnly) {
    return { rideshare: true, delivery: false, taxi: false, trucking: false, shipping: false };
  }
  return { rideshare: true, delivery: true, taxi: true, trucking: true, shipping: true };
}

function defaultFleetProductSettings(platformName: string, rideshareOnly: boolean): Record<string, unknown> {
  return {
    platformName,
    defaultCurrency: "JMD",
    fleetTimezone: "America/Jamaica",
    platformVersion: "1.0.0",
    maintenanceMode: false,
    maintenanceMessage: "",
    enabledBusinessTypes: fleetBusinessTypes(rideshareOnly),
    enabledModules: { ...DEFAULT_MODULES },
    registrationMode: "open",
    allowedDomains: [] as string[],
    requireApproval: false,
    welcomeEmailMessage: "",
    securityPolicies: { ...DEFAULT_SECURITY },
    announcement: { ...DEFAULT_ANNOUNCEMENT },
  };
}

function defaultConsumerSettings(platformName: string): Record<string, unknown> {
  return {
    platformName,
    defaultCurrency: "JMD",
    fleetTimezone: "America/Jamaica",
    maintenanceMode: false,
    maintenanceMessage: "",
    registrationMode: "open",
    allowedDomains: [] as string[],
    requireApproval: false,
    welcomeEmailMessage: "",
    securityPolicies: { ...DEFAULT_SECURITY },
    announcement: { ...DEFAULT_ANNOUNCEMENT },
  };
}

export function defaultSettingsForSegment(segment: SettingsSegment): Record<string, unknown> {
  switch (segment) {
    case "global":
      return {
        maintenanceMode: false,
        maintenanceMessage: "",
        securityPolicies: { ...DEFAULT_SECURITY },
        announcement: { ...DEFAULT_ANNOUNCEMENT },
      };
    case "fleet":
      return defaultFleetProductSettings("Roam Fleet", true);
    case "enterprise":
      return defaultFleetProductSettings("Roam Enterprise", false);
    case "rides":
      return defaultConsumerSettings("Roam Rides");
    case "driver":
      return defaultConsumerSettings("Roam Driver");
    case "haul":
      return defaultConsumerSettings("Roam Haul");
    case "dash":
      return defaultConsumerSettings("Roam Dash");
    default:
      return defaultFleetProductSettings("Roam Fleet", true);
  }
}

function mergeSettings(
  defaults: Record<string, unknown>,
  partial: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!partial || typeof partial !== "object") {
    return { ...defaults };
  }
  const result = { ...defaults };
  for (const key of Object.keys(partial)) {
    const defaultVal = defaults[key];
    const partialVal = partial[key];
    if (partialVal === undefined) continue;
    if (
      defaultVal !== null
      && typeof defaultVal === "object"
      && !Array.isArray(defaultVal)
      && partialVal !== null
      && typeof partialVal === "object"
      && !Array.isArray(partialVal)
    ) {
      result[key] = mergeSettings(
        defaultVal as Record<string, unknown>,
        partialVal as Record<string, unknown>,
      );
    } else {
      result[key] = partialVal;
    }
  }
  return result;
}

function isSettingsSegment(v: unknown): v is SettingsSegment {
  return typeof v === "string" && (ALL_SETTINGS_SEGMENTS as string[]).includes(v);
}

function segmentFromHost(hostHint: string): SettingsSegment | null {
  if (hostHint.includes("roamdominion")) return "global";
  if (hostHint.includes("roamenterprise")) return "enterprise";
  if (hostHint.includes("roamfleet")) return "fleet";
  if (hostHint.includes("roam-s") || hostHint.includes("roamrides")) return "rides";
  if (hostHint.includes("roamdriver")) return "driver";
  if (hostHint.includes("roamhaul")) return "haul";
  if (hostHint.includes("roamdash")) return "dash";
  return null;
}

/**
 * Resolve settings segment from request.
 * Priority: X-Roam-Settings-Segment → ?segment= → X-Roam-Product-Line → Origin/Referer → fleet
 */
export function resolveSettingsSegment(c: Context): SettingsSegment {
  const segmentHeader = c.req.header("X-Roam-Settings-Segment")?.trim().toLowerCase();
  if (isSettingsSegment(segmentHeader)) return segmentHeader;

  const segmentQuery = c.req.query("segment")?.trim().toLowerCase();
  if (isSettingsSegment(segmentQuery)) return segmentQuery;

  const productLine = c.req.header("X-Roam-Product-Line")?.trim().toLowerCase();
  if (productLine === "fleet" || productLine === "enterprise") {
    return productLine;
  }

  const origin = c.req.header("Origin")?.toLowerCase() || "";
  const referer = c.req.header("Referer")?.toLowerCase() || "";
  const hostHint = origin || referer;
  const fromHost = segmentFromHost(hostHint);
  if (fromHost) return fromHost;

  return "fleet";
}

/** Product line for backward-compatible API responses. */
export function segmentToProductLine(segment: SettingsSegment): ProductLine {
  return segment === "enterprise" ? "enterprise" : "fleet";
}

async function readRawSettings(segment: SettingsSegment): Promise<Record<string, unknown> | null> {
  const cacheKey = platformSettingsKvKey(segment);
  let settings = await kv.get(cacheKey);
  if (settings && typeof settings === "object") {
    return settings as Record<string, unknown>;
  }

  if (segment === "fleet" || segment === "enterprise") {
    const legacy = await kv.get(LEGACY_PLATFORM_SETTINGS_KEY);
    if (legacy && typeof legacy === "object") {
      return legacy as Record<string, unknown>;
    }
  }

  return null;
}

export async function getPlatformSettingsCached(
  segmentOrProductLine?: SettingsSegment | ProductLine,
): Promise<Record<string, unknown>> {
  const segment: SettingsSegment =
    segmentOrProductLine === "fleet" || segmentOrProductLine === "enterprise"
      ? segmentOrProductLine
      : (segmentOrProductLine ?? "fleet");

  const cacheKey = platformSettingsKvKey(segment);
  const cached = memCache.platformSettingsCache.get(cacheKey);
  if (cached) return cached;

  const raw = await readRawSettings(segment);
  const defaults = defaultSettingsForSegment(segment);
  const merged = mergeSettings(defaults, raw ?? undefined);

  memCache.platformSettingsCache.set(cacheKey, merged);
  return merged;
}

export function invalidatePlatformSettingsCache(segment: SettingsSegment): void {
  memCache.platformSettingsCache.invalidate(platformSettingsKvKey(segment));
}

export async function getSegmentSettingsSummary(): Promise<
  Array<{ segment: SettingsSegment; exists: boolean; updatedAt: string | null; platformName: string | null }>
> {
  const summaries = [];
  for (const segment of ALL_SETTINGS_SEGMENTS) {
    const raw = await kv.get(platformSettingsKvKey(segment));
    const exists = raw != null && typeof raw === "object";
    const record = exists ? (raw as Record<string, unknown>) : null;
    summaries.push({
      segment,
      exists,
      updatedAt: typeof record?.updatedAt === "string" ? record.updatedAt : null,
      platformName: typeof record?.platformName === "string" ? record.platformName : null,
    });
  }
  return summaries;
}

export async function getLatestSettingsUpdatedAt(): Promise<string | null> {
  let latest: string | null = null;
  const keys = [
    platformSettingsKvKey("global"),
    platformSettingsKvKey("fleet"),
    platformSettingsKvKey("enterprise"),
    LEGACY_PLATFORM_SETTINGS_KEY,
  ];
  for (const key of keys) {
    try {
      const settings = await kv.get(key);
      const updatedAt = settings?.updatedAt;
      if (typeof updatedAt === "string" && (!latest || updatedAt > latest)) {
        latest = updatedAt;
      }
    } catch {
      // ignore
    }
  }
  return latest;
}

type SettingsActor = { userId: string; email: string; name: string };

/** Platform staff or segment product admin may read/write segment settings. Global is platform staff only. */
export async function verifySettingsAccess(c: Context): Promise<SettingsActor | Response> {
  const segment = resolveSettingsSegment(c);
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const actor: SettingsActor = {
    userId: user.id,
    email: user.email || "",
    name: (user.user_metadata?.name as string | undefined) || user.email || "Unknown",
  };

  if (isPlatformStaffFromAuthUser(user)) {
    return actor;
  }

  if (segment === "global") {
    return c.json({ error: "Forbidden — platform role required" }, 403);
  }

  const productAuth = await requireProductAdmin(c, segment as FleetProductKey);
  if (productAuth instanceof Response) return productAuth;

  return {
    userId: productAuth.id,
    email: productAuth.email,
    name: productAuth.email || "Unknown",
  };
}

const SEGMENT_DEFAULT_NAMES: Record<SettingsSegment, string> = {
  global: "Roam Platform",
  fleet: "Roam Fleet",
  enterprise: "Roam Enterprise",
  rides: "Roam Rides",
  driver: "Roam Driver",
  haul: "Roam Haul",
  dash: "Roam Dash",
};

/** Public platform-status payload for a resolved segment. */
export function buildPlatformStatusPayload(
  segment: SettingsSegment,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const defaultName = SEGMENT_DEFAULT_NAMES[segment];
  const isProductLine = segment === "fleet" || segment === "enterprise";

  const payload: Record<string, unknown> = {
    segment,
    productLine: isProductLine ? segment : segmentToProductLine(segment),
    maintenanceMode: settings.maintenanceMode || false,
    maintenanceMessage:
      settings.maintenanceMessage || "We're performing scheduled maintenance. Back soon!",
    platformName: settings.platformName || defaultName,
    registrationMode: settings.registrationMode || "open",
    allowedDomains: settings.allowedDomains || [],
    defaultCurrency: settings.defaultCurrency || "JMD",
    fleetTimezone: settings.fleetTimezone || "America/Jamaica",
    announcement: (() => {
      const ann = settings.announcement as Record<string, unknown> | undefined;
      if (!ann || !ann.enabled) return null;
      const now = new Date().toISOString().split("T")[0];
      if (ann.startDate && now < String(ann.startDate)) return null;
      if (ann.endDate && now > String(ann.endDate)) return null;
      return {
        message: ann.message,
        type: ann.type,
        dismissible: ann.dismissible,
      };
    })(),
    sessionTimeoutMinutes:
      (settings.securityPolicies as Record<string, unknown> | undefined)?.sessionTimeoutMinutes ?? 0,
    passwordPolicy: {
      minLength:
        (settings.securityPolicies as Record<string, unknown> | undefined)?.minPasswordLength ?? 8,
      requireUppercase:
        (settings.securityPolicies as Record<string, unknown> | undefined)?.requireUppercase ?? false,
      requireNumber:
        (settings.securityPolicies as Record<string, unknown> | undefined)?.requireNumber ?? false,
      requireSpecialChar:
        (settings.securityPolicies as Record<string, unknown> | undefined)?.requireSpecialChar ?? false,
    },
  };

  if (isProductLine) {
    payload.enabledBusinessTypes = settings.enabledBusinessTypes || {
      rideshare: true,
      delivery: true,
      taxi: true,
      trucking: true,
      shipping: true,
    };
  }

  return payload;
}
