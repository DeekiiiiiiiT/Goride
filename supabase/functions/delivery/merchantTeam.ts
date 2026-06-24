import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendNotificationEmail } from "./admin/merchantAdminShared.ts";
import {
  resolveMerchantAccess,
  type ResolvedMerchantAccess,
  type TeamPermission,
} from "./merchantAuth.ts";

export const VALID_TEAM_ROLES = new Set(["staff", "manager", "admin"]);
export const VALID_TEAM_PERMISSIONS = new Set<TeamPermission>([
  "orders",
  "menu",
  "analytics",
  "payouts",
]);

export function mapTeamMember(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    email: row.email ? String(row.email) : undefined,
    role: String(row.role),
    permissions: (row.permissions as string[]) || [],
    isOwner: Boolean(row.is_owner),
  };
}

export function mapTeamInvite(row: Record<string, unknown>, emailSent?: boolean) {
  return {
    id: String(row.id),
    email: String(row.email),
    role: String(row.role),
    permissions: (row.permissions as string[]) || [],
    emailSent: emailSent ?? Boolean(row.email_sent_at),
    emailSentAt: row.email_sent_at ? String(row.email_sent_at) : undefined,
  };
}

export function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildTeamInviteUrl(token: string): string {
  const base = (Deno.env.get("PARTNER_PORTAL_URL") || "https://partner.roamdash.co")
    .replace(/\/$/, "");
  return `${base}/team-invite/${token}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.length <= 1 ? "*" : `${local[0]}***`;
  return `${visible}@${domain}`;
}

export function formatTeamRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    staff: "Staff",
    manager: "Manager",
    admin: "Admin",
  };
  return labels[role] || role;
}

export function isInviteExpired(invite: Record<string, unknown>): boolean {
  const expiresAt = invite.expires_at ? new Date(String(invite.expires_at)) : null;
  if (!expiresAt) return false;
  return expiresAt.getTime() <= Date.now();
}

export function assertOwnerAccess(
  resolved: ResolvedMerchantAccess,
): { ok: true } | { ok: false; status: number; message: string } {
  if (!resolved.membership.is_owner) {
    return { ok: false, status: 403, message: "Only the store owner can manage team members" };
  }
  return { ok: true };
}

export function renderTeamInviteEmail(opts: {
  merchantName: string;
  inviterEmail?: string | null;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}): { subject: string; html: string; text: string } {
  const roleLabel = formatTeamRoleLabel(opts.role);
  const expiryLabel = opts.expiresAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const subject = `You're invited to join ${opts.merchantName} on Roam Dash`;
  const text = [
    `You've been invited to join ${opts.merchantName} on Roam Dash as ${roleLabel}.`,
    opts.inviterEmail ? `Invited by: ${opts.inviterEmail}` : "",
    "",
    `Accept your invite: ${opts.inviteUrl}`,
    "",
    `This invite expires on ${expiryLabel}.`,
  ].filter(Boolean).join("\n");
  const html = `
    <p>You've been invited to join <strong>${opts.merchantName}</strong> on Roam Dash as <strong>${roleLabel}</strong>.</p>
    ${opts.inviterEmail ? `<p>Invited by: ${opts.inviterEmail}</p>` : ""}
    <p><a href="${opts.inviteUrl}">Accept your invite</a></p>
    <p>This invite expires on ${expiryLabel}.</p>
  `.trim();
  return { subject, html, text };
}

export async function sendTeamInviteEmail(opts: {
  to: string;
  merchantName: string;
  inviterEmail?: string | null;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}): Promise<{ sent: boolean; error?: string }> {
  const tpl = renderTeamInviteEmail(opts);
  const result = await sendNotificationEmail({
    to: opts.to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
  if (!result.sent) {
    console.log(`[team-invite] email skipped for ${opts.to}: ${result.reason || "unknown"}`);
  }
  return { sent: result.sent, error: result.reason };
}

export async function findPendingInviteForEmail(
  sb: SupabaseClient,
  email: string,
): Promise<Record<string, unknown> | null> {
  const normalized = email.trim().toLowerCase();
  const now = new Date().toISOString();
  const { data } = await sb
    .from("merchant_team_invites")
    .select("*, merchants(name)")
    .eq("status", "pending")
    .ilike("email", normalized)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

export function mapPendingTeamInviteSummary(invite: Record<string, unknown>) {
  const merchants = invite.merchants as Record<string, unknown> | null;
  return {
    id: String(invite.id),
    token: String(invite.token),
    merchantName: merchants?.name ? String(merchants.name) : "Store",
    role: String(invite.role),
    expiresAt: invite.expires_at ? String(invite.expires_at) : undefined,
  };
}

type TeamDeps = {
  getSupabase: (authHeader: string | null) => SupabaseClient;
  getServiceSupabase: () => SupabaseClient;
};

async function requireOwnerMerchant(
  authHeader: string,
): Promise<
  | { ok: true; user: { id: string; email?: string | null }; resolved: ResolvedMerchantAccess }
  | { ok: false; status: number; message: string }
> {
  const supabase = getSupabaseFromDeps(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Unauthorized" };

  const resolved = await resolveMerchantAccess(user.id, user.email);
  if (!resolved) return { ok: false, status: 403, message: "Not a merchant" };

  const ownerCheck = assertOwnerAccess(resolved);
  if (!ownerCheck.ok) return ownerCheck;

  return { ok: true, user, resolved };
}

let depsRef: TeamDeps | null = null;

function getSupabaseFromDeps(authHeader: string | null) {
  if (!depsRef) throw new Error("merchantTeam routes not initialized");
  return depsRef.getSupabase(authHeader);
}

function getServiceSb() {
  if (!depsRef) throw new Error("merchantTeam routes not initialized");
  return depsRef.getServiceSupabase();
}

async function deliverInviteEmail(
  sb: SupabaseClient,
  inviteId: string,
  invite: Record<string, unknown>,
  merchantName: string,
  inviterEmail?: string | null,
): Promise<boolean> {
  const token = String(invite.token);
  const emailResult = await sendTeamInviteEmail({
    to: String(invite.email),
    merchantName,
    inviterEmail,
    role: String(invite.role),
    inviteUrl: buildTeamInviteUrl(token),
    expiresAt: new Date(String(invite.expires_at)),
  });

  await sb
    .from("merchant_team_invites")
    .update({
      email_sent_at: emailResult.sent ? new Date().toISOString() : null,
      email_send_error: emailResult.sent ? null : (emailResult.error || "send_failed"),
    })
    .eq("id", inviteId);

  return emailResult.sent;
}

export function registerMerchantTeamRoutes(app: Hono, deps: TeamDeps) {
  depsRef = deps;

  app.get("/merchant/team/invites/preview/:token", async (c) => {
    const token = c.req.param("token");
    const sb = getServiceSb();
    const { data: invite, error } = await sb
      .from("merchant_team_invites")
      .select("*, merchants(name, verification_status)")
      .eq("token", token)
      .eq("status", "pending")
      .maybeSingle();

    if (error) return c.json({ error: error.message }, 500);
    if (!invite) return c.json({ error: "Invite not found" }, 404);

    const row = invite as Record<string, unknown>;
    if (isInviteExpired(row)) {
      return c.json({ error: "Invite expired" }, 410);
    }

    const merchant = row.merchants as Record<string, unknown> | null;
    return c.json({
      invite: {
        merchantName: merchant?.name ? String(merchant.name) : "Store",
        role: String(row.role),
        permissions: (row.permissions as string[]) || [],
        inviteeEmailMasked: maskEmail(String(row.email)),
        expiresAt: row.expires_at ? String(row.expires_at) : undefined,
        isExpired: false,
      },
    });
  });

  app.get("/merchant/team", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const merchantId = access.resolved.merchant.id as string;
    const sb = getServiceSb();
    const [membersRes, invitesRes] = await Promise.all([
      sb
        .from("merchant_team_members")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("is_owner", { ascending: false })
        .order("created_at", { ascending: true }),
      sb
        .from("merchant_team_invites")
        .select("*")
        .eq("merchant_id", merchantId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    if (membersRes.error) return c.json({ error: membersRes.error.message }, 500);
    if (invitesRes.error) return c.json({ error: invitesRes.error.message }, 500);

    return c.json({
      members: (membersRes.data || []).map((row) =>
        mapTeamMember(row as Record<string, unknown>)
      ),
      pendingInvites: (invitesRes.data || []).map((row) =>
        mapTeamInvite(row as Record<string, unknown>)
      ),
    });
  });

  app.post("/merchant/team/invites", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const body = await c.req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "staff");
    const inviteeName = body.name ? String(body.name).trim() : null;
    const permissions = Array.isArray(body.permissions) ? body.permissions : [];

    if (!email) return c.json({ error: "Email is required" }, 400);
    if (!VALID_TEAM_ROLES.has(role)) return c.json({ error: "Invalid role" }, 400);
    if (!permissions.every((p: string) => VALID_TEAM_PERMISSIONS.has(p as TeamPermission))) {
      return c.json({ error: "Invalid permissions" }, 400);
    }

    const merchantId = access.resolved.merchant.id as string;
    const sb = getServiceSb();

    const { data: existingMember } = await sb
      .from("merchant_team_members")
      .select("id")
      .eq("merchant_id", merchantId)
      .ilike("email", email)
      .maybeSingle();
    if (existingMember) {
      return c.json({ error: "This email already has access" }, 409);
    }

    const { data: existingInvite } = await sb
      .from("merchant_team_invites")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("status", "pending")
      .ilike("email", email)
      .maybeSingle();
    if (existingInvite) {
      return c.json({ error: "A pending invite already exists for this email" }, 409);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);
    const token = generateInviteToken();

    const { data, error } = await sb
      .from("merchant_team_invites")
      .insert({
        merchant_id: merchantId,
        email,
        role,
        permissions,
        status: "pending",
        invited_by: access.user.id,
        expires_at: expiresAt.toISOString(),
        token,
        invitee_name: inviteeName,
      })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);

    const merchantName = String(access.resolved.merchant.name || "your store");
    const emailSent = await deliverInviteEmail(
      sb,
      String((data as Record<string, unknown>).id),
      data as Record<string, unknown>,
      merchantName,
      access.user.email,
    );

    return c.json({
      invite: mapTeamInvite(data as Record<string, unknown>, emailSent),
    }, 201);
  });

  app.post("/merchant/team/invites/:id/resend", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const inviteId = c.req.param("id");
    const merchantId = access.resolved.merchant.id as string;
    const sb = getServiceSb();

    const { data: invite, error: fetchErr } = await sb
      .from("merchant_team_invites")
      .select("*")
      .eq("id", inviteId)
      .eq("merchant_id", merchantId)
      .eq("status", "pending")
      .single();

    if (fetchErr || !invite) return c.json({ error: "Invite not found" }, 404);
    if (isInviteExpired(invite as Record<string, unknown>)) {
      return c.json({ error: "Invite expired" }, 410);
    }

    const newToken = generateInviteToken();
    const { data: updated, error } = await sb
      .from("merchant_team_invites")
      .update({ token: newToken, email_sent_at: null, email_send_error: null })
      .eq("id", inviteId)
      .select()
      .single();

    if (error || !updated) return c.json({ error: error?.message || "Update failed" }, 500);

    const merchantName = String(access.resolved.merchant.name || "your store");
    const emailSent = await deliverInviteEmail(
      sb,
      inviteId,
      updated as Record<string, unknown>,
      merchantName,
      access.user.email,
    );

    return c.json({ invite: mapTeamInvite(updated as Record<string, unknown>, emailSent) });
  });

  app.delete("/merchant/team/invites/:id", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const inviteId = c.req.param("id");
    const sb = getServiceSb();
    const { error } = await sb
      .from("merchant_team_invites")
      .update({ status: "cancelled" })
      .eq("id", inviteId)
      .eq("merchant_id", access.resolved.merchant.id as string)
      .eq("status", "pending");

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  app.patch("/merchant/team/members/:id", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const memberId = c.req.param("id");
    const body = await c.req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.role != null) {
      if (!VALID_TEAM_ROLES.has(String(body.role))) {
        return c.json({ error: "Invalid role" }, 400);
      }
      updates.role = body.role;
    }
    if (body.permissions != null) {
      if (!Array.isArray(body.permissions) ||
        !body.permissions.every((p: string) => VALID_TEAM_PERMISSIONS.has(p as TeamPermission))) {
        return c.json({ error: "Invalid permissions" }, 400);
      }
      updates.permissions = body.permissions;
    }
    if (body.name != null) {
      const name = String(body.name).trim();
      if (name) updates.name = name;
    }

    const sb = getServiceSb();
    const merchantId = access.resolved.merchant.id as string;

    const { data: member } = await sb
      .from("merchant_team_members")
      .select("is_owner")
      .eq("id", memberId)
      .eq("merchant_id", merchantId)
      .single();

    if (!member) return c.json({ error: "Member not found" }, 404);
    if ((member as Record<string, unknown>).is_owner) {
      return c.json({ error: "Cannot modify owner" }, 400);
    }

    const { data, error } = await sb
      .from("merchant_team_members")
      .update(updates)
      .eq("id", memberId)
      .eq("merchant_id", merchantId)
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ member: mapTeamMember(data as Record<string, unknown>) });
  });

  app.delete("/merchant/team/members/:id", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const memberId = c.req.param("id");
    const merchantId = access.resolved.merchant.id as string;
    const sb = getServiceSb();

    const { data: member } = await sb
      .from("merchant_team_members")
      .select("is_owner, name, email")
      .eq("id", memberId)
      .eq("merchant_id", merchantId)
      .single();

    if (!member) return c.json({ error: "Member not found" }, 404);
    if ((member as Record<string, unknown>).is_owner) {
      return c.json({ error: "Cannot remove owner" }, 400);
    }

    const { error } = await sb
      .from("merchant_team_members")
      .delete()
      .eq("id", memberId)
      .eq("merchant_id", merchantId);

    if (error) return c.json({ error: error.message }, 500);

    await sb.from("merchant_audit_log").insert({
      merchant_id: merchantId,
      actor_id: access.user.id,
      actor_email: access.user.email || "",
      action: "team_member_removed",
      notes: `Removed ${(member as Record<string, unknown>).name || (member as Record<string, unknown>).email || memberId}`,
    });

    return c.json({ ok: true });
  });

  app.get("/merchant/team/invites/pending", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabaseFromDeps(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return c.json({ error: "Unauthorized" }, 401);

    const sb = getServiceSb();
    const email = user.email.trim().toLowerCase();
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("merchant_team_invites")
      .select("id, email, role, permissions, token, expires_at, merchant_id, merchants(name)")
      .eq("status", "pending")
      .ilike("email", email)
      .gt("expires_at", now);

    if (error) return c.json({ error: error.message }, 500);

    const invites = (data || []).map((row) => {
      const r = row as Record<string, unknown>;
      const merchants = r.merchants as Record<string, unknown> | null;
      return {
        id: String(r.id),
        email: String(r.email),
        role: String(r.role),
        permissions: (r.permissions as string[]) || [],
        token: String(r.token),
        expiresAt: r.expires_at ? String(r.expires_at) : undefined,
        merchantName: merchants?.name ? String(merchants.name) : "Store",
      };
    });

    return c.json({ invites });
  });

  app.post("/merchant/team/invites/:id/accept", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabaseFromDeps(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return c.json({ error: "Unauthorized" }, 401);

    const inviteId = c.req.param("id");
    const sb = getServiceSb();
    const email = user.email.trim().toLowerCase();

    const { data: invite, error: fetchErr } = await sb
      .from("merchant_team_invites")
      .select("*, merchants(verification_status)")
      .eq("id", inviteId)
      .eq("status", "pending")
      .ilike("email", email)
      .single();

    if (fetchErr || !invite) return c.json({ error: "Invite not found" }, 404);

    const row = invite as Record<string, unknown>;
    if (isInviteExpired(row)) return c.json({ error: "Invite expired" }, 410);

    const merchant = row.merchants as Record<string, unknown> | null;
    if (!merchant || merchant.verification_status !== "approved") {
      return c.json({ error: "Store is not available yet" }, 403);
    }

    const { data: existingMember } = await sb
      .from("merchant_team_members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingMember) {
      return c.json({ error: "You already belong to a store team" }, 409);
    }

    const merchantId = row.merchant_id as string;
    const displayName = row.invitee_name
      ? String(row.invitee_name)
      : (user.user_metadata?.name as string | undefined) || email.split("@")[0];

    const { data: member, error: memberErr } = await sb
      .from("merchant_team_members")
      .insert({
        merchant_id: merchantId,
        user_id: user.id,
        email,
        name: displayName,
        role: row.role,
        permissions: row.permissions,
        is_owner: false,
      })
      .select()
      .single();

    if (memberErr) return c.json({ error: memberErr.message }, 500);

    await sb.from("merchant_team_invites")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", inviteId);

    return c.json({ member: mapTeamMember(member as Record<string, unknown>) });
  });

  app.post("/merchant/team/invites/:id/decline", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabaseFromDeps(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return c.json({ error: "Unauthorized" }, 401);

    const sb = getServiceSb();
    const { data: invite } = await sb
      .from("merchant_team_invites")
      .select("expires_at")
      .eq("id", c.req.param("id"))
      .eq("status", "pending")
      .ilike("email", user.email.trim().toLowerCase())
      .maybeSingle();

    if (!invite) return c.json({ error: "Invite not found" }, 404);
    if (isInviteExpired(invite as Record<string, unknown>)) {
      return c.json({ error: "Invite expired" }, 410);
    }

    const { error } = await sb
      .from("merchant_team_invites")
      .update({ status: "cancelled" })
      .eq("id", c.req.param("id"))
      .eq("status", "pending")
      .ilike("email", user.email.trim().toLowerCase());

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });
}

export async function getPendingTeamInviteForProfile(
  getServiceSupabase: () => SupabaseClient,
  email?: string | null,
) {
  if (!email) return null;
  const invite = await findPendingInviteForEmail(getServiceSupabase(), email);
  if (!invite) return null;
  return mapPendingTeamInviteSummary(invite);
}
