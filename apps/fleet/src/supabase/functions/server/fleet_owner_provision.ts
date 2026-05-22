/**
 * Fleet owner provisioning — server-only role/metadata writes (Uber-style dual identity).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { inferProductLineFromUser, type ProductLine } from "./product_line.ts";

function readRolesArray(meta: Record<string, unknown> | undefined): string[] {
  const raw = meta?.roles;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    .map((r) => r.trim());
}

export function getJwtRoles(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): string[] {
  const fromApp = readRolesArray(user.app_metadata as Record<string, unknown> | undefined);
  if (fromApp.length > 0) return fromApp;
  const um = user.user_metadata?.role;
  if (typeof um === "string" && um.trim()) return [um.trim()];
  return [];
}

export function userCanAccessFleetPortal(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): boolean {
  const roles = getJwtRoles(user);
  if (roles.includes("admin") || roles.includes("fleet_owner")) return true;
  const legacy = user.user_metadata?.role;
  return legacy === "admin" || legacy === "fleet_owner";
}

export function userCanAccessDriverPortal(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): boolean {
  const roles = getJwtRoles(user);
  if (roles.includes("driver")) return true;
  return user.user_metadata?.role === "driver";
}

export function isFleetOwnerProvisioned(user: {
  id?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): boolean {
  if (!userCanAccessFleetPortal(user)) return false;
  const meta = user.user_metadata || {};
  const orgId = meta.organizationId as string | undefined;
  if (!orgId) return false;
  return inferProductLineFromUser(meta) === "fleet";
}

const ASSIGNABLE_ROLES = new Set([
  "admin",
  "fleet_owner",
  "driver",
  "fleet_manager",
  "fleet_accountant",
  "fleet_viewer",
]);

async function assignUserRoles(
  auth: SupabaseClient,
  userId: string,
  roles: string[],
  primaryRole?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = [...new Set(roles.map((r) => r.trim()).filter(Boolean))];
  if (normalized.length === 0) return { ok: false, error: "At least one role is required" };
  for (const r of normalized) {
    if (!ASSIGNABLE_ROLES.has(r)) return { ok: false, error: `Invalid role: ${r}` };
  }
  const primary = (primaryRole?.trim() || normalized[0]).trim();
  const rolesWithPrimary = normalized.includes(primary) ? normalized : [primary, ...normalized];

  const { data: existing, error: getErr } = await auth.auth.admin.getUserById(userId);
  if (getErr || !existing?.user) return { ok: false, error: getErr?.message ?? "User not found" };

  const prevApp = (existing.user.app_metadata ?? {}) as Record<string, unknown>;
  const { error: updateErr } = await auth.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...prevApp,
      role: primary,
      roles: rolesWithPrimary,
    },
  });
  if (updateErr) return { ok: false, error: updateErr.message };
  return { ok: true };
}

export type ProvisionFleetOwnerOpts = {
  name?: string | null;
  /** When true (default), also grant driver role + driver profile linked to fleet org */
  alsoDrive?: boolean;
  productLine?: ProductLine;
};

export type ProvisionFleetOwnerDeps = {
  supabase: SupabaseClient;
  upsertDriverProfile: (opts: {
    userId: string;
    mode: "fleet" | "independent";
    fleetId?: string | null;
    displayName?: string | null;
    status?: string;
    onboardingComplete?: boolean;
    markFleetJoined?: boolean;
  }) => Promise<void>;
  invalidateCustomerCache: () => Promise<void>;
};

export async function provisionFleetOwner(
  deps: ProvisionFleetOwnerDeps,
  userId: string,
  opts: ProvisionFleetOwnerOpts = {},
): Promise<
  | { ok: true; alreadyProvisioned: boolean; organizationId: string }
  | { ok: false; error: string; status?: number }
> {
  const productLine = opts.productLine ?? "fleet";
  const alsoDrive = opts.alsoDrive !== false;

  const { data: authData, error: authErr } = await deps.supabase.auth.admin.getUserById(userId);
  if (authErr || !authData?.user) {
    return { ok: false, error: "User not found", status: 404 };
  }

  const user = authData.user;
  if (isFleetOwnerProvisioned(user)) {
    const orgId = (user.user_metadata?.organizationId as string) || user.id;
    return { ok: true, alreadyProvisioned: true, organizationId: orgId };
  }

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const legacyRole = typeof meta.role === "string" ? meta.role : "";
  if (legacyRole === "passenger") {
    return { ok: false, error: "Passenger accounts cannot create a fleet on Roam Fleet.", status: 403 };
  }

  const existingLine = inferProductLineFromUser(meta);
  if (existingLine === "enterprise" && productLine === "fleet") {
    return {
      ok: false,
      error: "This account is registered on Roam Enterprise. Use roamenterprise.co for fleet management.",
      status: 403,
    };
  }

  const displayName =
    (opts.name && opts.name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    (user.email?.split("@")[0] ?? "Fleet Owner");

  const orgId = userId;
  const roles = new Set(getJwtRoles(user));
  roles.add("admin");
  if (alsoDrive) roles.add("driver");
  if (legacyRole === "driver") roles.add("driver");

  const roleAssign = await assignUserRoles(deps.supabase, userId, [...roles], "admin");
  if (!roleAssign.ok) return { ok: false, error: roleAssign.error, status: 500 };

  const nextMeta: Record<string, unknown> = {
    ...meta,
    name: displayName,
    role: "admin",
    productLine: "fleet",
    businessType: "rideshare",
    organizationId: orgId,
  };

  const { error: metaErr } = await deps.supabase.auth.admin.updateUserById(userId, {
    user_metadata: nextMeta,
  });
  if (metaErr) return { ok: false, error: metaErr.message, status: 500 };

  try {
    await kv.set(`preferences:${userId}`, { businessType: "rideshare" });
    const existingGeneral = await kv.get("preferences:general") || {};
    await kv.set("preferences:general", { ...existingGeneral, businessType: "rideshare" });
  } catch (prefErr) {
    console.warn("[provisionFleetOwner] preferences save failed:", prefErr);
  }

  if (alsoDrive || legacyRole === "driver") {
    const driverKvKey = `driver:${userId}`;
    try {
      const driverKv = await kv.get(driverKvKey);
      const email = user.email || "";
      if (driverKv) {
        await kv.set(driverKvKey, {
          ...driverKv,
          organizationId: orgId,
        });
      } else {
        await kv.set(driverKvKey, {
          id: userId,
          driverId: userId,
          driverName: displayName,
          email,
          status: "active",
          createdAt: new Date().toISOString(),
          acceptanceRate: 0,
          cancellationRate: 0,
          completionRate: 0,
          ratingLast500: 5.0,
          totalEarnings: 0,
          organizationId: orgId,
        });
      }
    } catch (kvErr) {
      console.warn("[provisionFleetOwner] driver kv (non-fatal):", kvErr);
    }

    const { data: existingProf } = await deps.supabase
      .from("driver_profiles")
      .select("onboarding_complete")
      .eq("user_id", userId)
      .maybeSingle();

    await deps.upsertDriverProfile({
      userId,
      mode: "fleet",
      fleetId: orgId,
      displayName,
      status: "active",
      onboardingComplete: existingProf?.onboarding_complete === true,
      markFleetJoined: true,
    });
  }

  try {
    await deps.invalidateCustomerCache();
  } catch (e) {
    console.warn("[provisionFleetOwner] cache invalidate (non-fatal):", e);
  }

  return { ok: true, alreadyProvisioned: false, organizationId: orgId };
}

export async function enableDriverForFleetOwner(
  deps: ProvisionFleetOwnerDeps,
  userId: string,
): Promise<
  | { ok: true; alreadyEnabled: boolean }
  | { ok: false; error: string; status?: number }
> {
  const { data: authData, error: authErr } = await deps.supabase.auth.admin.getUserById(userId);
  if (authErr || !authData?.user) {
    return { ok: false, error: "User not found", status: 404 };
  }

  const user = authData.user;
  if (!isFleetOwnerProvisioned(user)) {
    return { ok: false, error: "Create your fleet account before enabling driver access.", status: 403 };
  }

  const roles = new Set(getJwtRoles(user));
  if (roles.has("driver") && user.user_metadata?.role !== "passenger") {
    const { data: prof } = await deps.supabase
      .from("driver_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (prof) return { ok: true, alreadyEnabled: true };
  }

  roles.add("driver");
  const roleAssign = await assignUserRoles(deps.supabase, userId, [...roles], "admin");
  if (!roleAssign.ok) return { ok: false, error: roleAssign.error, status: 500 };

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const orgId = (meta.organizationId as string) || userId;
  const displayName =
    (typeof meta.name === "string" && meta.name.trim()) ||
    (user.email?.split("@")[0] ?? "Driver");

  const { data: existingProf } = await deps.supabase
    .from("driver_profiles")
    .select("onboarding_complete")
    .eq("user_id", userId)
    .maybeSingle();

  try {
    const driverKvKey = `driver:${userId}`;
    const driverKv = await kv.get(driverKvKey);
    const email = user.email || "";
    if (driverKv) {
      await kv.set(driverKvKey, { ...driverKv, organizationId: orgId });
    } else {
      await kv.set(driverKvKey, {
        id: userId,
        driverId: userId,
        driverName: displayName,
        email,
        status: "active",
        createdAt: new Date().toISOString(),
        acceptanceRate: 0,
        cancellationRate: 0,
        completionRate: 0,
        ratingLast500: 5.0,
        totalEarnings: 0,
        organizationId: orgId,
      });
    }
  } catch (kvErr) {
    console.warn("[enableDriverForFleetOwner] driver kv (non-fatal):", kvErr);
  }

  await deps.upsertDriverProfile({
    userId,
    mode: "fleet",
    fleetId: orgId,
    displayName,
    status: "active",
    onboardingComplete: existingProf?.onboarding_complete === true,
    markFleetJoined: true,
  });

  const metaPatch = { ...meta };
  if (metaPatch.role !== "admin") metaPatch.role = "admin";
  await deps.supabase.auth.admin.updateUserById(userId, { user_metadata: metaPatch });

  return { ok: true, alreadyEnabled: false };
}
