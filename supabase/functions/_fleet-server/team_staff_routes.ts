/**
 * Staff seat routes. Customer portals never delete an account or set a password.
 */
import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { RbacUser } from "./rbac_middleware.ts";
import { resolveProductLine } from "./product_line.ts";
import { isTeamRole } from "./team_staff_policy.ts";
import {
  acceptStaffInvite,
  acceptOwnershipTransfer,
  assertMfaIfRequired,
  cancelOwnershipTransfer,
  changeStaffRole,
  createStaffInvite,
  invitesForEmail,
  listStaff,
  pendingOwnershipTransfer,
  removeStaffSeat,
  resendStaffInvite,
  revokeStaffInvite,
  sendOwnershipNotice,
  sendStaffResetEmail,
  setStaffStatus,
  type AuditCtx,
} from "./team_staff_service.ts";

const PREFIX = "/make-server-37f42386";

type Deps = {
  supabase: SupabaseClient;
  requireAuth: () => unknown;
  requirePermission: (permission: string) => unknown;
};

function userOf(c: { get: (k: string) => unknown }): RbacUser | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return user?.userId ? user : null;
}

function auditOf(c: { req: { header: (n: string) => string | undefined } }): AuditCtx {
  return {
    ipAddress: c.req.header("x-forwarded-for") || c.req.header("cf-connecting-ip") || null,
    userAgent: c.req.header("user-agent") || null,
  };
}

function fail(c: { json: (b: unknown, s: number) => Response }, e: unknown): Response {
  const err = e as Error & { status?: number };
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  return c.json({ error: err.message || "Request failed" }, status);
}

async function orgId(supabase: SupabaseClient, c: { get: (k: string) => unknown; req: { header: (n: string) => string | undefined } }): Promise<string | null> {
  const user = userOf(c);
  const fromUser = user?.organizationId?.trim();
  if (fromUser) return fromUser;
  const header = c.req.header("X-Roam-Organization-Id")?.trim();
  if (!header || !user?.userId) return null;
  const { data } = await supabase.from("organizations").select("id, owner_id").eq("id", header).maybeSingle();
  if (data && String(data.owner_id) === user.userId) return header;
  return null;
}

export function registerTeamStaffRoutes(app: Hono, deps: Deps): void {
  const auth = deps.requireAuth() as never;
  const perm = (p: string) => deps.requirePermission(p) as never;

  app.get(`${PREFIX}/team/access`, auth, async (c) => {
    try {
      const user = userOf(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      const invites = user.email ? await invitesForEmail(deps.supabase, user.email) : [];
      const pendingTransfer = await pendingOwnershipTransfer(deps.supabase, user.userId);
      const { data: outgoingRows } = await deps.supabase
        .schema("platform")
        .from("ownership_transfers")
        .select("id")
        .eq("from_user_id", user.userId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      const outgoing = Array.isArray(outgoingRows) ? outgoingRows[0] : null;
      return c.json({
        portal: user.portal === true,
        role: user.resolvedRole,
        staffRole: user.staffRole ?? null,
        organizationId: user.organizationId,
        productLine: user.productLine ?? null,
        pendingInvite: invites[0] ?? null,
        pendingTransfer,
        outgoingTransfer: outgoing?.id ? { id: String(outgoing.id) } : null,
      });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.get(`${PREFIX}/team/staff`, auth, perm("users.view"), async (c) => {
    try {
      const id = await orgId(deps.supabase, c);
      if (!id) return c.json({ error: "Organization context required" }, 400);
      const listed = await listStaff(deps.supabase, id);
      return c.json(listed);
    } catch (e) {
      return fail(c, e);
    }
  });

  app.get(`${PREFIX}/team/staff/invites/mine`, auth, async (c) => {
    try {
      const user = userOf(c);
      if (!user?.email) return c.json({ invites: [] });
      const invites = await invitesForEmail(deps.supabase, user.email);
      return c.json({ invites });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.post(`${PREFIX}/team/staff/invites`, auth, perm("users.invite"), async (c) => {
    try {
      const user = userOf(c);
      const id = await orgId(deps.supabase, c);
      if (!user || !id) return c.json({ error: "Organization context required" }, 400);
      const body = await c.req.json();
      const result = await createStaffInvite(deps.supabase, {
        email: String(body.email || ""),
        name: String(body.name || ""),
        role: String(body.role || ""),
        organizationId: id,
        actorId: user.userId,
        actorRole: user.resolvedRole,
        productLine: resolveProductLine(c),
        sectionOverrides: body.sectionOverrides,
        audit: auditOf(c),
      });
      return c.json({ success: true, ...result }, 202);
    } catch (e) {
      return fail(c, e);
    }
  });

  app.post(`${PREFIX}/team/staff/invites/accept`, auth, async (c) => {
    try {
      const user = userOf(c);
      if (!user?.email) return c.json({ error: "Unauthorized" }, 401);
      const body = await c.req.json();
      const result = await acceptStaffInvite(deps.supabase, {
        inviteId: String(body.inviteId || ""),
        userId: user.userId,
        email: user.email,
        audit: auditOf(c),
      });
      return c.json({ success: true, ...result });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.post(`${PREFIX}/team/staff/invites/:id/resend`, auth, perm("users.invite"), async (c) => {
    try {
      const user = userOf(c);
      const id = await orgId(deps.supabase, c);
      if (!user || !id) return c.json({ error: "Organization context required" }, 400);
      await resendStaffInvite(deps.supabase, {
        organizationId: id,
        actorId: user.userId,
        inviteId: c.req.param("id"),
        audit: auditOf(c),
      });
      return c.json({ success: true, message: "Invite resent" });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.delete(`${PREFIX}/team/staff/invites/:id`, auth, perm("users.invite"), async (c) => {
    try {
      const user = userOf(c);
      const id = await orgId(deps.supabase, c);
      if (!user || !id) return c.json({ error: "Organization context required" }, 400);
      await revokeStaffInvite(deps.supabase, {
        organizationId: id,
        actorId: user.userId,
        inviteId: c.req.param("id"),
        audit: auditOf(c),
      });
      return c.json({ success: true });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.patch(`${PREFIX}/team/staff/:userId`, auth, perm("users.edit_role"), async (c) => {
    try {
      const user = userOf(c);
      const id = await orgId(deps.supabase, c);
      if (!user || !id) return c.json({ error: "Organization context required" }, 400);
      const body = await c.req.json();
      const targetId = c.req.param("userId");
      if (body.status === "suspended" || body.status === "active") {
        if (user.resolvedRole !== "fleet_owner" && user.resolvedRole !== "platform_owner") {
          return c.json({ error: "Only the owner can suspend a seat" }, 403);
        }
        await setStaffStatus(deps.supabase, {
          organizationId: id,
          actorId: user.userId,
          targetId,
          status: body.status,
          audit: auditOf(c),
        });
        return c.json({ success: true });
      }
      const role = String(body.role || "");
      if (!isTeamRole(role)) return c.json({ error: "Invalid role" }, 400);
      await changeStaffRole(deps.supabase, {
        organizationId: id,
        actorId: user.userId,
        actorRole: user.resolvedRole,
        targetId,
        role,
        sectionOverrides: body.sectionOverrides,
        audit: auditOf(c),
      });
      return c.json({ success: true, message: "Access updated." });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.delete(`${PREFIX}/team/staff/:userId`, auth, perm("users.remove"), async (c) => {
    try {
      const user = userOf(c);
      const id = await orgId(deps.supabase, c);
      if (!user || !id) return c.json({ error: "Organization context required" }, 400);
      await removeStaffSeat(deps.supabase, {
        organizationId: id,
        actorId: user.userId,
        targetId: c.req.param("userId"),
        audit: auditOf(c),
      });
      return c.json({ success: true, message: "Removed from team. Their Roam account is unchanged." });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.post(`${PREFIX}/team/staff/:userId/password-reset-email`, auth, perm("users.send_reset_email"), async (c) => {
    try {
      const user = userOf(c);
      const id = await orgId(deps.supabase, c);
      if (!user || !id) return c.json({ error: "Organization context required" }, 400);
      await sendStaffResetEmail(deps.supabase, {
        organizationId: id,
        actorId: user.userId,
        targetId: c.req.param("userId"),
        audit: auditOf(c),
      });
      return c.json({ success: true, message: "Password reset email sent. You will not see the link." });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.get(`${PREFIX}/team/audit`, auth, perm("users.view"), async (c) => {
    try {
      const id = await orgId(deps.supabase, c);
      if (!id) return c.json({ error: "Organization context required" }, 400);
      const { data, error } = await deps.supabase
        .schema("platform")
        .from("permission_audit_log")
        .select("id, actor_user_id, target_user_id, action, metadata, created_at")
        .contains("metadata", { organizationId: id })
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return c.json({ events: data || [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.patch(`${PREFIX}/team/security`, auth, perm("settings.edit"), async (c) => {
    try {
      const id = await orgId(deps.supabase, c);
      if (!id) return c.json({ error: "Organization context required" }, 400);
      const body = await c.req.json();
      const { error } = await deps.supabase
        .from("organizations")
        .update({ require_owner_mfa: !!body.requireOwnerMfa })
        .eq("id", id);
      if (error) throw new Error(error.message);
      return c.json({ success: true, requireOwnerMfa: !!body.requireOwnerMfa });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.post(`${PREFIX}/team/ownership-transfer`, auth, perm("settings.edit"), async (c) => {
    try {
      const user = userOf(c);
      const id = await orgId(deps.supabase, c);
      if (!user || !id) return c.json({ error: "Organization context required" }, 400);
      const mfa = await assertMfaIfRequired(deps.supabase, id, user.userId);
      if (mfa) return c.json({ error: mfa }, 403);
      const { data: org } = await deps.supabase.from("organizations").select("owner_id").eq("id", id).maybeSingle();
      if (!org?.owner_id || String(org.owner_id) !== user.userId) {
        return c.json({ error: "Only the owner can start a transfer" }, 403);
      }
      const body = await c.req.json();
      const toUserId = String(body.toUserId || "");
      if (!toUserId || toUserId === user.userId) return c.json({ error: "Choose another staff member" }, 400);
      const { data: seat } = await deps.supabase
        .schema("platform")
        .from("user_roles")
        .select("id, status")
        .eq("user_id", toUserId)
        .eq("scope_type", "organization")
        .eq("scope_id", id)
        .eq("status", "active")
        .maybeSingle();
      if (!seat) return c.json({ error: "That person needs an active staff seat first" }, 400);
      const { data: created, error } = await deps.supabase
        .schema("platform")
        .from("ownership_transfers")
        .insert({ organization_id: id, from_user_id: user.userId, to_user_id: toUserId })
        .select("id, expires_at")
        .single();
      if (error) throw new Error(error.message);
      await sendOwnershipNotice(deps.supabase, toUserId, id).catch(() => false);
      return c.json({ success: true, transfer: created });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.post(`${PREFIX}/team/ownership-transfer/:id/accept`, auth, async (c) => {
    try {
      const user = userOf(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      await acceptOwnershipTransfer(deps.supabase, {
        transferId: c.req.param("id"),
        userId: user.userId,
        audit: auditOf(c),
      });
      return c.json({ success: true });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.post(`${PREFIX}/team/ownership-transfer/:id/cancel`, auth, async (c) => {
    try {
      const user = userOf(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      await cancelOwnershipTransfer(deps.supabase, {
        transferId: c.req.param("id"),
        userId: user.userId,
        audit: auditOf(c),
      });
      return c.json({ success: true });
    } catch (e) {
      return fail(c, e);
    }
  });
}
