/**
 * Shared feature flags for Edge Functions.
 *
 * Resolution order:
 * 1. Env var (FLAG_NAME or FEATURE_<NAME>) — "1" / "true" / "yes" => on
 * 2. Optional `platform_feature_flags` table (public schema) when a service client is provided
 * 3. Caller default
 *
 * Table stub (apply when ready):
 *   create table if not exists public.platform_feature_flags (
 *     name text primary key,
 *     enabled boolean not null default false,
 *     updated_at timestamptz not null default now()
 *   );
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const envCache = new Map<string, boolean | undefined>();
const dbCache = new Map<string, { value: boolean; expiresAt: number }>();
const DB_TTL_MS = 30_000;

function parseBool(raw: string | undefined | null): boolean | undefined {
  if (raw == null || raw === "") return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return undefined;
}

function readEnvFlag(name: string): boolean | undefined {
  if (envCache.has(name)) return envCache.get(name);
  const direct = parseBool(Deno.env.get(name));
  const prefixed = direct === undefined
    ? parseBool(Deno.env.get(`FEATURE_${name}`))
    : direct;
  envCache.set(name, prefixed);
  return prefixed;
}

function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

async function readDbFlag(name: string, client?: SupabaseClient | null): Promise<boolean | undefined> {
  const cached = dbCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const sb = client ?? serviceClient();
  if (!sb) return undefined;

  try {
    const { data, error } = await sb
      .from("platform_feature_flags")
      .select("enabled")
      .eq("name", name)
      .maybeSingle();
    if (error || !data) {
      // Table may not exist yet — treat as unset.
      return undefined;
    }
    const value = Boolean((data as { enabled?: boolean }).enabled);
    dbCache.set(name, { value, expiresAt: Date.now() + DB_TTL_MS });
    return value;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a named flag. Env wins over DB; both unset → `defaultValue`.
 */
export async function getFlag(
  name: string,
  defaultValue: boolean,
  opts?: { client?: SupabaseClient },
): Promise<boolean> {
  const fromEnv = readEnvFlag(name);
  if (fromEnv !== undefined) return fromEnv;

  const fromDb = await readDbFlag(name, opts?.client);
  if (fromDb !== undefined) return fromDb;

  return defaultValue;
}

/** Sync env-only check (no DB) — for hot paths / tests. */
export function getFlagFromEnv(name: string, defaultValue: boolean): boolean {
  const fromEnv = readEnvFlag(name);
  return fromEnv !== undefined ? fromEnv : defaultValue;
}

/** Clear caches (tests). */
export function clearFeatureFlagCaches(): void {
  envCache.clear();
  dbCache.clear();
}
