/**
 * Workforce lifecycle: pause, resume, remove-from-fleet, and the worker leaving.
 * Ending a relationship never deletes the Roam account.
 */
import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type * as KvStore from "./kv_store.tsx";
import type { RbacUser } from "./rbac_middleware.ts";
import { writeAdminAuditBestEffort } from "../delivery/admin/adminAuditWriter.ts";
import { namesMatch } from "./team_staff_policy.ts";
import { assertMfaIfRequired } from "./team_staff_service.ts";
import { offboardingCheck } from "./workforce_offboarding.ts";
import {
  clearDetachedFleetOrg,
  hasOpenMembershipInOrg,
  listOpenMembershipsForOrg,
  setMembershipStatus,
  type ServiceLine,
} from "./workforce_membership.ts";
import { invalidateAccessCache } from "./access_cache.ts";
import { unlinkCourierFromFleet, type WorkforceCourierLinkDeps } from "./workforce_link.ts";

const PREFIX = "/make-server-37f42386";

type Deps = {
  supabase: SupabaseClient;
  kv: typeof KvStore;
  requireAuth: () => unknown;
  requirePermission: (permission: string) => unknown;
  getOrgId: (c: { get: (k: string) => unknown }) => string | null;
  invalidateDriverCache: () => void;
};

function userOf(c: { get: (k: string) => unknown }): RbacUser | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return user?.userId ? user : null;
}

async function releaseVehicle(deps: Deps, driverId: string): Promise<void> {
  const driverKv = await deps.kv.get(`driver:${driverId}`);
  if (driverKv && typeof driverKv === "object") {
    await deps.kv.set(`driver:${driverId}`, {
      ...driverKv,
      assignedVehicleId: null,
      assignedVehiclePlate: null,
      assignedVehicleName: null,
      vehicle: null,
      workforcePaused: true,
    });
  }
}

async function clearRideshareMirror(deps: Deps, userId: string): Promise<void> {
  await deps.supabase
    .from("driver_profiles")
    .update({
      mode: "independent",
      fleet_id: null,
      fleet_joined_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  const driverKv = await deps.kv.get(`driver:${userId}`);
  if (driverKv && typeof driverKv === "object") {
    await deps.kv.set(`driver:${userId}`, {
      ...driverKv,
      organizationId: null,
      assignedVehicleId: null,
      workforcePaused: false,
    });
  }
  await releaseVehicle(deps, userId);
  deps.invalidateDriverCache();
}

export async function endWorkforceInOrg(
  deps: Deps,
  input: {
    organizationId: string;
    userId: string;
    actorId: string;
    reason: "fleet_removed" | "worker_left";
    confirmName?: string;
    serviceLine?: ServiceLine;
  },
): Promise<{ ok: true } | { ok: false; status: number; error: string; blockers?: unknown; displayName?: string }> {
  if (input.reason === "fleet_removed") {
    const mfa = await assertMfaIfRequired(deps.supabase, input.organizationId, input.actorId);
    if (mfa) return { ok: false, status: 403, error: mfa };
  }
  const report = await offboardingCheck(deps.supabase, input.userId, input.organizationId);
  if (!report.clear && !namesMatch(input.confirmName || "", report.displayName)) {
    return {
      ok: false,
      status: 409,
      error: "Type the person's name to remove them while something is still open.",
      blockers: report.blockers,
      displayName: report.displayName,
    };
  }
  const lines: ServiceLine[] = input.serviceLine
    ? [input.serviceLine]
    : ["rideshare", "rush_delivery"];
  let ended = 0;
  for (const line of lines) {
    const row = await setMembershipStatus(deps.supabase, {
      organizationId: input.organizationId,
      userId: input.userId,
      serviceLine: line,
      status: "ended",
      endedBy: input.actorId,
      endedReason: input.reason,
    });
    if (!row) continue;
    ended += 1;
    if (line === "rideshare") await clearRideshareMirror(deps, input.userId);
    if (line === "rush_delivery") {
      const courierDeps: WorkforceCourierLinkDeps = {
        supabase: deps.supabase,
        kv: deps.kv,
        invalidateDriverCache: deps.invalidateDriverCache,
      };
      await unlinkCourierFromFleet(courierDeps, input.userId);
    }
  }
  if (!ended) return { ok: false, status: 404, error: "This person is not in your fleet" };
  await clearDetachedFleetOrg(deps.supabase, input.userId, input.organizationId);
  invalidateAccessCache(input.userId);
  await writeAdminAuditBestEffort({
    actorUserId: input.actorId,
    targetUserId: input.userId,
    action: input.reason === "worker_left" ? "workforce.left" : "workforce.removed",
    metadata: {
      organizationId: input.organizationId,
      blockers: report.blockers,
      acknowledged: !report.clear,
    },
  });
  return { ok: true };
}

export function registerWorkforceLifecycleRoutes(app: Hono, deps: Deps): void {
  const auth = deps.requireAuth() as never;
  const perm = (p: string) => deps.requirePermission(p) as never;

  app.get(`${PREFIX}/workforce/members`, auth, perm("drivers.view"), async (c) => {
    try {
      const orgId = deps.getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);
      const rows = await listOpenMembershipsForOrg(deps.supabase, orgId);
      const members = [];
      for (const row of rows) {
        const { data } = await deps.supabase.auth.admin.getUserById(row.user_id);
        const meta = (data?.user?.user_metadata || {}) as Record<string, unknown>;
        members.push({
          userId: row.user_id,
          name: (typeof meta.name === "string" && meta.name) || data?.user?.email || "Unknown",
          email: data?.user?.email || "",
          serviceLine: row.service_line,
          status: row.status,
          joinedAt: row.joined_at,
        });
      }
      return c.json({ members });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.get(`${PREFIX}/workforce/members/:userId/offboarding-check`, auth, perm("workforce.remove"), async (c) => {
    try {
      const orgId = deps.getOrgId(c);
      const userId = c.req.param("userId");
      if (!orgId) return c.json({ error: "Organization required" }, 403);
      const open = await hasOpenMembershipInOrg(deps.supabase, userId, orgId);
      if (!open) return c.json({ error: "This person is not in your fleet" }, 403);
      const report = await offboardingCheck(deps.supabase, userId, orgId);
      return c.json(report);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post(`${PREFIX}/workforce/members/:userId/pause`, auth, perm("workforce.pause"), async (c) => {
    try {
      const orgId = deps.getOrgId(c);
      const actor = userOf(c);
      if (!orgId || !actor) return c.json({ error: "Organization required" }, 403);
      const body = await c.req.json().catch(() => ({}));
      const line: ServiceLine = body.serviceLine === "rush_delivery" ? "rush_delivery" : "rideshare";
      const row = await setMembershipStatus(deps.supabase, {
        organizationId: orgId,
        userId: c.req.param("userId"),
        serviceLine: line,
        status: "paused",
      });
      if (!row) return c.json({ error: "This person is not in your fleet" }, 404);
      await releaseVehicle(deps, c.req.param("userId"));
      invalidateAccessCache(c.req.param("userId"));
      await writeAdminAuditBestEffort({
        actorUserId: actor.userId,
        targetUserId: c.req.param("userId"),
        action: "workforce.paused",
        metadata: { organizationId: orgId, serviceLine: line },
      });
      return c.json({ success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post(`${PREFIX}/workforce/members/:userId/resume`, auth, perm("workforce.pause"), async (c) => {
    try {
      const orgId = deps.getOrgId(c);
      const actor = userOf(c);
      if (!orgId || !actor) return c.json({ error: "Organization required" }, 403);
      const body = await c.req.json().catch(() => ({}));
      const line: ServiceLine = body.serviceLine === "rush_delivery" ? "rush_delivery" : "rideshare";
      const row = await setMembershipStatus(deps.supabase, {
        organizationId: orgId,
        userId: c.req.param("userId"),
        serviceLine: line,
        status: "active",
      });
      if (!row) return c.json({ error: "This person is not in your fleet" }, 404);
      const driverKv = await deps.kv.get(`driver:${c.req.param("userId")}`);
      if (driverKv && typeof driverKv === "object") {
        await deps.kv.set(`driver:${c.req.param("userId")}`, { ...driverKv, workforcePaused: false });
      }
      invalidateAccessCache(c.req.param("userId"));
      await writeAdminAuditBestEffort({
        actorUserId: actor.userId,
        targetUserId: c.req.param("userId"),
        action: "workforce.resumed",
        metadata: { organizationId: orgId, serviceLine: line },
      });
      return c.json({ success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post(`${PREFIX}/workforce/members/:userId/end`, auth, perm("workforce.remove"), async (c) => {
    try {
      const orgId = deps.getOrgId(c);
      const actor = userOf(c);
      if (!orgId || !actor) return c.json({ error: "Organization required" }, 403);
      const body = await c.req.json().catch(() => ({}));
      const line = body.serviceLine === "rush_delivery" || body.serviceLine === "rideshare"
        ? body.serviceLine as ServiceLine
        : undefined;
      const result = await endWorkforceInOrg(deps, {
        organizationId: orgId,
        userId: c.req.param("userId"),
        actorId: actor.userId,
        reason: "fleet_removed",
        confirmName: typeof body.confirmName === "string" ? body.confirmName : undefined,
        serviceLine: line,
      });
      if (!result.ok) {
        return c.json({ error: result.error, blockers: result.blockers, displayName: result.displayName }, result.status);
      }
      return c.json({ success: true, message: "Removed from your fleet. Their Roam account is unchanged." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.get(`${PREFIX}/driver/workforce/me`, auth, async (c) => {
    try {
      const actor = userOf(c);
      if (!actor) return c.json({ error: "Unauthorized" }, 401);
      const { data } = await deps.supabase
        .from("driver_profiles")
        .select("fleet_id, fleet_joined_at, mode")
        .eq("user_id", actor.userId)
        .maybeSingle();
      let fleetName: string | null = null;
      let fleetTag: string | null = null;
      if (data?.fleet_id) {
        const { data: org } = await deps.supabase
          .from("organizations")
          .select("name, fleet_tag")
          .eq("id", data.fleet_id)
          .maybeSingle();
        fleetName = (org?.name as string) || null;
        fleetTag = (org?.fleet_tag as string) || null;
      }
      return c.json({
        mode: data?.mode === "fleet" ? "fleet" : "independent",
        fleetId: data?.fleet_id || null,
        fleetName,
        fleetTag,
        joinedAt: data?.fleet_joined_at || null,
        sees: ["name", "photo", "phone", "email", "trips", "earnings"],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.get(`${PREFIX}/driver/workforce/offboarding-check`, auth, async (c) => {
    try {
      const actor = userOf(c);
      if (!actor) return c.json({ error: "Unauthorized" }, 401);
      const { data: mem } = await deps.supabase
        .from("fleet_workforce_memberships")
        .select("organization_id")
        .eq("user_id", actor.userId)
        .neq("status", "ended")
        .limit(1);
      const orgId = Array.isArray(mem) && mem[0]?.organization_id
        ? String(mem[0].organization_id)
        : "";
      return c.json(await offboardingCheck(deps.supabase, actor.userId, orgId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post(`${PREFIX}/driver/workforce/leave`, auth, async (c) => {
    try {
      const actor = userOf(c);
      if (!actor) return c.json({ error: "Unauthorized" }, 401);
      const { data } = await deps.supabase
        .from("driver_profiles")
        .select("fleet_id")
        .eq("user_id", actor.userId)
        .maybeSingle();
      const fleetId = data?.fleet_id ? String(data.fleet_id) : "";
      if (!fleetId) return c.json({ error: "You are not in a fleet" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const result = await endWorkforceInOrg(deps, {
        organizationId: fleetId,
        userId: actor.userId,
        actorId: actor.userId,
        reason: "worker_left",
        confirmName: typeof body.confirmName === "string" ? body.confirmName : undefined,
        serviceLine: "rideshare",
      });
      if (!result.ok) {
        return c.json({ error: result.error, blockers: result.blockers, displayName: result.displayName }, result.status);
      }
      return c.json({ success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });
}
