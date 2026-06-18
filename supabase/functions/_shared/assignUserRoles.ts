/**
 * Server-only role assignment — writes app_metadata.roles + app_metadata.role.
 * Clients must not call updateUser for permission fields.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const VALID_ROLES = new Set([
  "platform_owner",
  "platform_support",
  "platform_analyst",
  "dash_admin",
  "dash_ops",
  "rides_admin",
  "rides_ops",
  "driver_admin",
  "driver_ops",
  "haul_admin",
  "haul_ops",
  "fleet_admin",
  "fleet_ops",
  "enterprise_admin",
  "enterprise_ops",
  "fleet_owner",
  "fleet_manager",
  "fleet_accountant",
  "fleet_viewer",
  "driver",
  "hauler",
  "superadmin",
  "admin",
  "manager",
  "viewer",
]);

export function isAssignableRole(raw: string): boolean {
  const r = (raw ?? "").trim();
  return r.length > 0 && VALID_ROLES.has(r);
}

export function serviceAuthClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export type AssignUserRolesResult =
  | { ok: true; userId: string; roles: string[]; primaryRole: string }
  | { ok: false; error: string };

/**
 * Assign roles on app_metadata (authoritative for admin/API gates).
 */
export async function assignUserRoles(
  userId: string,
  roles: string[],
  primaryRole?: string,
): Promise<AssignUserRolesResult> {
  const normalized = [...new Set(roles.map((r) => r.trim()).filter(Boolean))];
  if (normalized.length === 0) {
    return { ok: false, error: "At least one role is required" };
  }
  for (const r of normalized) {
    if (!isAssignableRole(r)) {
      return { ok: false, error: `Invalid role: ${r}` };
    }
  }

  const primary = (primaryRole?.trim() || normalized[0]).trim();
  if (!normalized.includes(primary)) {
    normalized.unshift(primary);
  }

  const auth = serviceAuthClient();
  const { data: existing, error: getErr } = await auth.auth.admin.getUserById(userId);
  if (getErr || !existing.user) {
    return { ok: false, error: getErr?.message ?? "User not found" };
  }

  const prevApp = (existing.user.app_metadata ?? {}) as Record<string, unknown>;
  const { error: updateErr } = await auth.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...prevApp,
      role: primary,
      roles: normalized,
    },
  });

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  return { ok: true, userId, roles: normalized, primaryRole: primary };
}
