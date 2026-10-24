/**
 * Single writer for who drives or couriers for a fleet.
 * Profiles, KV, and app_metadata.organizationId are mirrors.
 * user_metadata is never read or written here.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ServiceLine = "rideshare" | "rush_delivery";
export type MembershipStatus = "active" | "paused" | "offboarding" | "ended";
export type JoinedVia = "fleet_tag" | "invite_code" | "roam_tag_invite" | "migration";
export type EndedReason = "fleet_removed" | "worker_left" | "roam_action";

export type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  service_line: ServiceLine;
  status: MembershipStatus;
  joined_at: string;
  joined_via: JoinedVia;
};

function fleetFrom(supabase: SupabaseClient, table: string): any | null {
  // Public view: the fleet schema is not readable through the app API for this table.
  if (table === "workforce_memberships") return supabase.from("fleet_workforce_memberships");
  const schemaFn = (supabase as { schema?: (name: string) => { from: (t: string) => unknown } }).schema;
  if (typeof schemaFn !== "function") return null;
  return schemaFn.call(supabase, "fleet").from(table);
}

export async function getOpenMembership(
  supabase: SupabaseClient,
  userId: string,
  serviceLine: ServiceLine,
): Promise<MembershipRow | null> {
  const q = fleetFrom(supabase, "workforce_memberships");
  if (!q) return null;
  const { data, error } = await q
    .select("id, organization_id, user_id, service_line, status, joined_at, joined_via")
    .eq("user_id", userId)
    .eq("service_line", serviceLine)
    .neq("status", "ended")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MembershipRow | null) ?? null;
}

export async function listOpenMembershipsForOrg(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<MembershipRow[]> {
  const q = fleetFrom(supabase, "workforce_memberships");
  if (!q) return [];
  const { data, error } = await q
    .select("id, organization_id, user_id, service_line, status, joined_at, joined_via")
    .eq("organization_id", organizationId)
    .neq("status", "ended");
  if (error) throw new Error(error.message);
  return (data as MembershipRow[] | null) ?? [];
}

export async function setWorkforceMembership(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    userId: string;
    serviceLine: ServiceLine;
    joinedVia: JoinedVia;
    joinRequestId?: string | null;
    status?: "active" | "paused";
  },
): Promise<void> {
  const q = fleetFrom(supabase, "workforce_memberships");
  if (!q) return;
  const open = await getOpenMembership(supabase, input.userId, input.serviceLine);
  if (open && open.organization_id !== input.organizationId) {
    const err = new Error("Already linked to another fleet for this service");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  const now = new Date().toISOString();
  if (open) {
    const { error } = await q.update({
      status: input.status ?? "active",
      updated_at: now,
    }).eq("id", open.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await q.insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    service_line: input.serviceLine,
    status: input.status ?? "active",
    joined_at: now,
    joined_via: input.joinedVia,
    join_request_id: input.joinRequestId ?? null,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
}

export async function setMembershipStatus(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    userId: string;
    serviceLine: ServiceLine;
    status: "active" | "paused" | "ended";
    endedBy?: string | null;
    endedReason?: EndedReason | null;
  },
): Promise<MembershipRow | null> {
  const open = await getOpenMembership(supabase, input.userId, input.serviceLine);
  if (!open || open.organization_id !== input.organizationId) return null;
  const q = fleetFrom(supabase, "workforce_memberships");
  if (!q) return null;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: input.status, updated_at: now };
  if (input.status === "ended") {
    patch.ended_at = now;
    patch.ended_by = input.endedBy ?? null;
    patch.ended_reason = input.endedReason ?? "fleet_removed";
  }
  const { error } = await q.update(patch).eq("id", open.id);
  if (error) throw new Error(error.message);
  return { ...open, status: input.status };
}

export async function hasOpenMembershipInOrg(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const q = fleetFrom(supabase, "workforce_memberships");
  if (!q) return false;
  const { data, error } = await q
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .neq("status", "ended")
    .limit(1);
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

/** Drop the login's fleet id once no open membership and no active seat remain. */
export async function clearDetachedFleetOrg(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<void> {
  if (await hasOpenMembershipInOrg(supabase, userId, organizationId)) return;
  const { data: seats, error } = await supabase
    .schema("platform")
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", organizationId)
    .eq("status", "active")
    .limit(1);
  if (error) throw new Error(error.message);
  if (Array.isArray(seats) && seats.length > 0) return;

  const { data: authData } = await supabase.auth.admin.getUserById(userId);
  const user = authData?.user;
  if (!user) return;
  const app = { ...(user.app_metadata || {}) } as Record<string, unknown>;
  const meta = { ...(user.user_metadata || {}) } as Record<string, unknown>;
  let changed = false;
  if (app.organizationId === organizationId) {
    delete app.organizationId;
    changed = true;
  }
  if (meta.organizationId === organizationId) {
    delete meta.organizationId;
    changed = true;
  }
  if (changed) {
    await supabase.auth.admin.updateUserById(userId, {
      app_metadata: app,
      user_metadata: meta,
    });
  }
  const { invalidateAccessCache } = await import("./access_cache.ts");
  invalidateAccessCache(userId);
}
