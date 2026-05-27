/**
 * Load/patch app permission policy from rides.app_permission_policy.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getCatalogEntry,
  getDefaultPolicyFlags,
  mergeCatalogWithPolicy,
  type AppPermissionPolicyFlags,
  type AppPermissionPolicyRow,
  type AppPermissionSurface,
} from "./appPermissionCatalog.ts";

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { permissions: AppPermissionPolicyRow[]; at: number }>();

export function invalidateAppPermissionPolicyCache(surface?: AppPermissionSurface): void {
  if (surface) cache.delete(surface);
  else cache.clear();
}

type DbRow = {
  permission_key: string;
  enabled: boolean;
  prompt_onboarding: boolean;
  block_until_granted: boolean;
};

export async function loadAppPermissionPolicy(
  db: SupabaseClient,
  tableName: string,
  surface: AppPermissionSurface,
): Promise<AppPermissionPolicyRow[]> {
  const hit = cache.get(surface);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.permissions;

  const { data, error } = await db
    .from(tableName)
    .select("permission_key, enabled, prompt_onboarding, block_until_granted")
    .eq("surface", surface);

  if (error) {
    console.warn("app_permission_policy_load_failed", surface, error.message);
    const fallback = mergeCatalogWithPolicy(surface, []);
    cache.set(surface, { permissions: fallback, at: Date.now() });
    return fallback;
  }

  const rows = (data ?? []) as DbRow[];
  const merged = mergeCatalogWithPolicy(surface, rows);
  cache.set(surface, { permissions: merged, at: Date.now() });
  return merged;
}

export type PolicyPatch = {
  key: string;
  enabled?: boolean;
  prompt_onboarding?: boolean;
  block_until_granted?: boolean;
};

export function parsePolicyPatches(
  surface: AppPermissionSurface,
  items: unknown,
): { ok: true; patches: PolicyPatch[] } | { ok: false; error: string } {
  if (!Array.isArray(items) || !items.length) {
    return { ok: false, error: "no_changes" };
  }
  const patches: PolicyPatch[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const key = typeof item.key === "string" ? item.key.trim() : "";
    if (!key || !getCatalogEntry(surface, key)) {
      return { ok: false, error: `invalid_permission_key:${key || "empty"}` };
    }
    const patch: PolicyPatch = { key };
    if (item.enabled !== undefined) patch.enabled = item.enabled === true;
    if (item.prompt_onboarding !== undefined) {
      patch.prompt_onboarding = item.prompt_onboarding === true;
    }
    if (item.block_until_granted !== undefined) {
      patch.block_until_granted = item.block_until_granted === true;
    }
    if (
      patch.enabled === undefined &&
      patch.prompt_onboarding === undefined &&
      patch.block_until_granted === undefined
    ) {
      continue;
    }
    patches.push(patch);
  }
  if (!patches.length) return { ok: false, error: "no_changes" };
  return { ok: true, patches };
}

export async function patchAppPermissionPolicy(
  db: SupabaseClient,
  tableName: string,
  surface: AppPermissionSurface,
  patches: PolicyPatch[],
  adminUserId: string,
): Promise<AppPermissionPolicyRow[]> {
  const now = new Date().toISOString();

  for (const patch of patches) {
    const defaults = getDefaultPolicyFlags(surface, patch.key);
    const { data: existing } = await db
      .from(tableName)
      .select("*")
      .eq("surface", surface)
      .eq("permission_key", patch.key)
      .maybeSingle();

    const current = existing as Record<string, unknown> | null;
    const row = {
      surface,
      permission_key: patch.key,
      enabled: patch.enabled ?? (current?.enabled as boolean) ?? defaults.enabled,
      prompt_onboarding: patch.prompt_onboarding ??
        (current?.prompt_onboarding as boolean) ?? defaults.prompt_onboarding,
      block_until_granted: patch.block_until_granted ??
        (current?.block_until_granted as boolean) ?? defaults.block_until_granted,
      updated_at: now,
      updated_by: adminUserId,
    };

    const { error } = await db.from(tableName).upsert(row, {
      onConflict: "surface,permission_key",
    });
    if (error) throw new Error(error.message);
  }

  invalidateAppPermissionPolicyCache(surface);
  return loadAppPermissionPolicy(db, tableName, surface);
}

export function policyDto(permissions: AppPermissionPolicyRow[]) {
  return { permissions };
}
