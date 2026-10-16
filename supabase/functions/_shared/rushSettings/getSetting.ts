/**
 * Rush settings read path.
 * Resolution: env emergency override → market → platform → registry default.
 * Keep in sync with packages/rush-settings registry keys.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRegistryEntry, type EdgeSettingDef } from "./registry.ts";
import { validateKind } from "./validateWritable.ts";

export { validateKind, assertWritableValue } from "./validateWritable.ts";

export type GetSettingOptions = {
  marketId?: string | null;
  /** Injected for tests / callers that already hold a service client. */
  supabase?: SupabaseClient;
  /** Bypass cache (tests). */
  skipCache?: boolean;
};

const PLATFORM_SCOPE_ID = "00000000-0000-0000-0000-000000000000";
const CACHE_TTL_MS = 30_000;

type CacheEntry = { value: unknown; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) {
    throw new Error("rushSettings: SUPABASE_URL / SERVICE_ROLE_KEY missing");
  }
  return createClient(url, key);
}

function cacheKey(key: string, marketId?: string | null): string {
  return `${key}::${marketId ?? ""}`;
}

/** Exported for Deno tests. */
export function clearSettingCache(): void {
  cache.clear();
}

/** Parse env string into the setting's kind. */
export function parseEnvOverride(
  raw: string,
  def: EdgeSettingDef,
): unknown | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;

  let envName = def.envOverride ?? "";
  // Keys named *_OFF invert: truthy env means setting value false.
  const invertOff = /_OFF$/i.test(envName);

  switch (def.kind) {
    case "boolean": {
      const truthy = ["1", "true", "yes", "on"].includes(trimmed.toLowerCase());
      const falsy = ["0", "false", "no", "off"].includes(trimmed.toLowerCase());
      if (!truthy && !falsy) return undefined;
      const bool = truthy;
      return invertOff ? !bool : bool;
    }
    case "number": {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return undefined;
      // offer TTL env is milliseconds; setting is seconds
      if (/_TTL_MS$/i.test(envName) && n >= 1000) return Math.round(n / 1000);
      return n;
    }
    case "string":
    case "enum":
      return trimmed;
    case "string[]":
    case "number[]":
    case "object":
      try {
        return JSON.parse(trimmed);
      } catch {
        return undefined;
      }
    default:
      return undefined;
  }
}

/**
 * Safe fallback when the store cannot be read (onReadError: 'safe').
 * Keep taking orders / card payments; never invent maintenance.
 */
export function safeReadFallback(key: string, def: EdgeSettingDef): unknown {
  if (def.kind === "boolean") {
    if (key.includes("maintenance")) return false;
    if (
      key === "customer.ordering.enabled" ||
      key === "customer.payment.card" ||
      key.endsWith(".ordering.enabled")
    ) {
      return true;
    }
  }
  return def.default;
}

function coerceOrDefault(
  key: string,
  raw: unknown,
  def: EdgeSettingDef,
): unknown {
  if (validateKind(def.kind, raw, def.enumValues)) return raw;
  console.error(`[rushSettings] invalid value for ${key}; using default`, { raw });
  return def.default;
}

async function loadScopedValue(
  sb: SupabaseClient,
  key: string,
  scope: "platform" | "market",
  scopeId: string,
): Promise<{ value: unknown; version: number } | null> {
  const { data, error } = await sb
    .schema("rush_config")
    .from("setting_values")
    .select("value, version")
    .eq("key", key)
    .eq("scope", scope)
    .eq("scope_id", scopeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { value: data.value, version: data.version as number };
}

/**
 * Resolve a setting value.
 * Order: env → market (if allowed + marketId) → platform → registry default.
 */
export async function getSetting<T = unknown>(
  key: string,
  opts?: GetSettingOptions,
): Promise<T> {
  const def = getRegistryEntry(key);
  if (!def) {
    throw new Error(`Unknown rush setting key: ${key}`);
  }

  const ck = cacheKey(key, opts?.marketId);
  if (!opts?.skipCache) {
    const hit = cache.get(ck);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value as T;
    }
  }

  // 1) Env emergency override
  if (def.envOverride) {
    const envRaw = Deno.env.get(def.envOverride);
    if (envRaw != null && envRaw !== "") {
      const parsed = parseEnvOverride(envRaw, def);
      if (parsed !== undefined && validateKind(def.kind, parsed, def.enumValues)) {
        console.error(`[rushSettings] env override active: ${def.envOverride} for ${key}`);
        cache.set(ck, { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
        return parsed as T;
      }
    }
  }

  let resolved: unknown | undefined;

  try {
    const sb = opts?.supabase ?? serviceClient();
    // 2) Market override
    if (opts?.marketId && def.scopes.includes("market")) {
      const marketRow = await loadScopedValue(sb, key, "market", opts.marketId);
      if (marketRow) {
        resolved = coerceOrDefault(key, marketRow.value, def);
      }
    }

    // 3) Platform value
    if (resolved === undefined) {
      const platformRow = await loadScopedValue(sb, key, "platform", PLATFORM_SCOPE_ID);
      if (platformRow) {
        resolved = coerceOrDefault(key, platformRow.value, def);
      }
    }
  } catch (err) {
    console.error(`[rushSettings] read failed for ${key}`, err);
    const fallback = def.onReadError === "safe"
      ? safeReadFallback(key, def)
      : def.default;
    cache.set(ck, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback as T;
  }

  // 4) Registry default
  if (resolved === undefined) {
    resolved = def.default;
  }

  cache.set(ck, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
  return resolved as T;
}

/** Max version across all stored values — used for app-config ETag. */
export async function getConfigVersionHash(
  sb?: SupabaseClient,
): Promise<string> {
  const client = sb ?? serviceClient();
  try {
    const { data, error } = await client
      .schema("rush_config")
      .from("setting_values")
      .select("key, version, updated_at");
    if (error) throw error;
    const rows = (data ?? []) as Array<{ key: string; version: number; updated_at: string }>;
    let sum = 0;
    let latest = "";
    for (const r of rows) {
      sum += Number(r.version) || 0;
      if (r.updated_at > latest) latest = r.updated_at;
    }
    return `v${sum}-${latest || "0"}`;
  } catch {
    return "v0-default";
  }
}
