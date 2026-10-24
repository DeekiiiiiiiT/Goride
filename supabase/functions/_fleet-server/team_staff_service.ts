/**
 * Staff seats on platform.user_roles. Never sets a password or deletes an account.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { writeAdminAuditBestEffort, type AdminAuditInput } from "../delivery/admin/adminAuditWriter.ts";
import { invalidateAccessCache } from "./access_cache.ts";
import {
  canGrantRole,
  isOwnerRole,
  isPlatformRole,
  isTeamRole,
  type TeamRole,
} from "./team_staff_policy.ts";

export type AuditCtx = { ipAddress?: string | null; userAgent?: string | null };

export type StaffSeat = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "suspended" | "invited";
  lastActive: string | null;
  isOwner: boolean;
  inviteId: string | null;
};

const STAFF_ROLE_NAMES = [
  "fleet_manager",
  "fleet_accountant",
  "fleet_viewer",
  "enterprise_dispatcher",
  "enterprise_customs",
  "enterprise_warehouse",
  "enterprise_finance",
  "enterprise_viewer",
  "fleet_owner",
  "enterprise_owner",
];

function platform(supabase: SupabaseClient) {
  return supabase.schema("platform");
}

function clientIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim() ?? "";
  if (/^[\d.]+$/.test(first) || first.includes(":")) return first;
  return null;
}

async function audit(
  input: Omit<AdminAuditInput, "ipAddress" | "userAgent"> & AuditCtx,
): Promise<void> {
  await writeAdminAuditBestEffort({
    ...input,
    ipAddress: clientIp(input.ipAddress),
    userAgent: input.userAgent ?? null,
  });
}

async function roleByName(
  supabase: SupabaseClient,
  name: string,
): Promise<{ id: string; name: string; level: number } | null> {
  const { data, error } = await platform(supabase)
    .from("roles")
    .select("id, name, level")
    .eq("name", name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; name: string; level: number } | null;
}

export async function findAuthUserByEmail(
  email: string,
): Promise<{ id: string; email: string; app_metadata: Record<string, unknown> } | null> {
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return null;
  const url = `${base}/auth/v1/admin/users?page=1&per_page=20`;
  const res = await fetch(`${url}&filter=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  const users = Array.isArray(body?.users) ? body.users : [];
  const match = users.find(
    (u: { email?: string }) => String(u.email || "").toLowerCase() === email.toLowerCase(),
  );
  if (!match?.id) return null;
  return {
    id: String(match.id),
    email: String(match.email || email),
    app_metadata: (match.app_metadata || {}) as Record<string, unknown>,
  };
}

async function countRecent(
  supabase: SupabaseClient,
  action: string,
  actorId: string,
  sinceIso: string,
  targetId?: string,
): Promise<number> {
  let q = platform(supabase)
    .from("permission_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("action", action)
    .eq("actor_user_id", actorId)
    .gte("created_at", sinceIso);
  if (targetId) q = q.eq("target_user_id", targetId);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

export async function assertMfaIfRequired(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const { data: org } = await supabase
    .from("organizations")
    .select("require_owner_mfa")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org?.require_owner_mfa) return null;
  const { data: ident } = await platform(supabase)
    .from("identities")
    .select("mfa_enrolled")
    .eq("user_id", userId)
    .maybeSingle();
  if (ident?.mfa_enrolled) return null;
  return "Turn on two-factor authentication in your Roam account before you can do this.";
}

async function actorLevel(supabase: SupabaseClient, roleName: string): Promise<number> {
  const row = await roleByName(supabase, roleName);
  if (row) return row.level;
  if (roleName === "fleet_owner" || roleName === "enterprise_owner" || roleName === "admin") return 900;
  if (roleName === "platform_owner") return 1000;
  return 0;
}

export async function createStaffInvite(
  supabase: SupabaseClient,
  input: {
    email: string;
    name: string;
    role: string;
    organizationId: string;
    actorId: string;
    actorRole: string;
    productLine: "fleet" | "enterprise";
    sectionOverrides?: Record<string, unknown>;
    audit: AuditCtx;
  },
): Promise<{ pending: true; existingAccount: boolean; message: string }> {
  const email = input.email.trim().toLowerCase();
  if (!isTeamRole(input.role)) {
    const err = new Error("Invalid team role");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const target = await roleByName(supabase, input.role);
  const targetLevel = target?.level ?? 0;
  const level = await actorLevel(supabase, input.actorRole);
  if (!target || !canGrantRole(level, targetLevel, input.role)) {
    const err = new Error("You cannot grant that role");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await countRecent(supabase, "team.staff.invited", input.actorId, hourAgo);
  if (recent >= 20) {
    const err = new Error("Too many invites. Try again later.");
    (err as Error & { status?: number }).status = 429;
    throw err;
  }

  const existing = await findAuthUserByEmail(email);
  if (existing && isPlatformRole(String(existing.app_metadata.role || ""))) {
    const err = new Error("This email belongs to a platform account and cannot be invited.");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }

  const { data: openInvite } = await platform(supabase)
    .from("pending_invites")
    .select("id")
    .eq("email", email)
    .eq("scope_type", "organization")
    .eq("scope_id", input.organizationId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (openInvite?.id) {
    const err = new Error("An invite is already waiting for this email.");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }

  if (existing && target) {
    const { data: seat } = await platform(supabase)
      .from("user_roles")
      .select("id, status")
      .eq("user_id", existing.id)
      .eq("role_id", target.id)
      .eq("scope_type", "organization")
      .eq("scope_id", input.organizationId)
      .maybeSingle();
    if (seat?.id && seat.status !== "suspended") {
      const err = new Error("This person is already on your team.");
      (err as Error & { status?: number }).status = 409;
      throw err;
    }
  }

  let emailed = false;
  if (!existing) {
    const redirect = input.productLine === "enterprise"
      ? "https://roamenterprise.co"
      : "https://roamfleet.co";
    const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { name: input.name },
      redirectTo: redirect,
    });
    if (inviteErr && !/already/i.test(inviteErr.message || "")) {
      throw new Error(inviteErr.message);
    }
    emailed = !inviteErr;
  } else {
    emailed = await sendStaffInviteNotice(email, input.name, input.productLine);
  }

  const { error: insErr } = await platform(supabase).from("pending_invites").insert({
    email,
    role_id: target.id,
    invited_by: input.actorId,
    scope_type: "organization",
    scope_id: input.organizationId,
    metadata: {
      name: input.name,
      productLine: input.productLine,
      sectionOverrides: input.sectionOverrides ?? {},
      role: input.role,
    },
  });
  if (insErr) throw new Error(insErr.message);

  await audit({
    actorUserId: input.actorId,
    action: "team.staff.invited",
    resourceType: "organization",
    resourceId: input.organizationId,
    metadata: { email, role: input.role, existingAccount: !!existing, organizationId: input.organizationId },
    ...input.audit,
  });

  return {
    pending: true,
    existingAccount: !!existing,
    message: emailed
      ? (existing
        ? `Invite emailed. ${input.name} signs in and accepts. They keep their Roam login.`
        : `Invite emailed to ${email}. They set their own password.`)
      : `Invite saved. ${input.name || email} will see it when they sign in.`,
  };
}

export async function acceptStaffInvite(
  supabase: SupabaseClient,
  input: { inviteId: string; userId: string; email: string; audit: AuditCtx },
): Promise<{ role: string; organizationId: string }> {
  const email = input.email.trim().toLowerCase();
  const { data: invite, error } = await platform(supabase)
    .from("pending_invites")
    .select("id, email, role_id, scope_id, expires_at, accepted_at, revoked_at, metadata")
    .eq("id", input.inviteId)
    .eq("scope_type", "organization")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!invite || invite.accepted_at || invite.revoked_at) {
    const err = new Error("This invite is no longer valid");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  if (String(invite.email).toLowerCase() !== email) {
    const err = new Error("Sign in with the invited email to accept");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await platform(supabase).from("pending_invites").update({
      revoked_at: new Date().toISOString(),
    }).eq("id", invite.id);
    const err = new Error("This invite has expired");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }

  const { data: role } = await platform(supabase)
    .from("roles")
    .select("name")
    .eq("id", invite.role_id)
    .maybeSingle();
  const roleName = String(role?.name || "");
  if (!isTeamRole(roleName)) {
    const err = new Error("Invite role is not a staff role");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const existingSeat = await seatFor(supabase, String(invite.scope_id), input.userId);
  if (existingSeat) {
    const { error: seatErr } = await platform(supabase).from("user_roles").update({
      role_id: invite.role_id,
      status: "active",
    }).eq("id", existingSeat.id);
    if (seatErr) throw new Error(seatErr.message);
  } else {
    const { error: seatErr } = await platform(supabase).from("user_roles").insert({
      user_id: input.userId,
      role_id: invite.role_id,
      scope_type: "organization",
      scope_id: invite.scope_id,
      granted_by: input.userId,
      status: "active",
    });
    if (seatErr && !/duplicate|unique/i.test(seatErr.message)) throw new Error(seatErr.message);
  }

  await platform(supabase).from("pending_invites").update({
    accepted_at: new Date().toISOString(),
    accepted_user_id: input.userId,
  }).eq("id", invite.id);

  const meta = (invite.metadata || {}) as Record<string, unknown>;
  await mirrorStaffOrg(supabase, input.userId, {
    organizationId: String(invite.scope_id),
    productLine: meta.productLine === "enterprise" ? "enterprise" : "fleet",
    sectionOverrides: (meta.sectionOverrides || {}) as Record<string, unknown>,
  });
  invalidateAccessCache(input.userId);

  await audit({
    actorUserId: input.userId,
    targetUserId: input.userId,
    action: "team.staff.accepted",
    metadata: { role: roleName, organizationId: invite.scope_id },
    ...input.audit,
  });

  return { role: roleName, organizationId: String(invite.scope_id) };
}

async function mirrorStaffOrg(
  supabase: SupabaseClient,
  userId: string,
  patch: {
    organizationId: string;
    productLine: "fleet" | "enterprise";
    sectionOverrides?: Record<string, unknown>;
  },
): Promise<void> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return;
  const app = { ...(data.user.app_metadata || {}) } as Record<string, unknown>;
  if (!app.organizationId) app.organizationId = patch.organizationId;
  app.productLine = patch.productLine;
  if (patch.sectionOverrides) app.sectionOverrides = patch.sectionOverrides;
  await supabase.auth.admin.updateUserById(userId, { app_metadata: app });
}

const MIRRORED_STAFF = new Set([
  "admin",
  "manager",
  "viewer",
  "fleet_owner",
  "fleet_manager",
  "fleet_accountant",
  "fleet_viewer",
  "enterprise_owner",
  "enterprise_dispatcher",
  "enterprise_customs",
  "enterprise_warehouse",
  "enterprise_finance",
  "enterprise_viewer",
]);

async function clearMirroredStaffRole(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return;
  const app = { ...(data.user.app_metadata || {}) } as Record<string, unknown>;
  if (typeof app.role === "string" && MIRRORED_STAFF.has(app.role)) delete app.role;
  if (Array.isArray(app.roles)) {
    app.roles = app.roles.filter((role) => typeof role === "string" && !MIRRORED_STAFF.has(role));
  }
  await supabase.auth.admin.updateUserById(userId, { app_metadata: app });
}

async function sendStaffInviteNotice(
  email: string,
  name: string,
  productLine: "fleet" | "enterprise",
): Promise<boolean> {
  const link = productLine === "enterprise" ? "https://roamenterprise.co" : "https://roamfleet.co";
  const who = name || "there";
  try {
    const { sendNotificationEmail } = await import("../delivery/admin/merchantAdminShared.ts");
    const sent = await sendNotificationEmail({
      to: email,
      subject: "You have a Roam dashboard invite",
      text: `${who}, sign in at ${link} and accept the invite. Your Roam login stays the same.`,
      html: `<p>${who}, you have a dashboard invite.</p><p><a href="${link}">Sign in and accept</a>. Your Roam login stays the same.</p>`,
    });
    return sent.sent;
  } catch (err) {
    console.warn("[team] invite notice failed", err);
    return false;
  }
}

export async function listStaff(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ seats: StaffSeat[]; invites: StaffSeat[] }> {
  const now = new Date().toISOString();
  await platform(supabase)
    .from("pending_invites")
    .update({ revoked_at: now })
    .eq("scope_type", "organization")
    .eq("scope_id", organizationId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .lt("expires_at", now);

  const { data: org } = await supabase
    .from("organizations")
    .select("owner_id")
    .eq("id", organizationId)
    .maybeSingle();
  const ownerId = org?.owner_id ? String(org.owner_id) : null;

  const { data: seatRows, error } = await platform(supabase)
    .from("user_roles")
    .select("user_id, status, role_id, roles(name)")
    .eq("scope_type", "organization")
    .eq("scope_id", organizationId);
  if (error) throw new Error(error.message);

  const seats: StaffSeat[] = [];
  for (const row of seatRows || []) {
    const roleName = String((row as { roles?: { name?: string } }).roles?.name || "");
    if (!STAFF_ROLE_NAMES.includes(roleName)) continue;
    const userId = String(row.user_id);
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const user = userData?.user;
    const meta = (user?.user_metadata || {}) as Record<string, unknown>;
    seats.push({
      id: userId,
      name: (typeof meta.name === "string" && meta.name) || user?.email || "Unknown",
      email: user?.email || "",
      role: ownerId === userId ? "fleet_owner" : roleName,
      status: row.status === "suspended" ? "suspended" : "active",
      lastActive: user?.last_sign_in_at || null,
      isOwner: ownerId === userId,
      inviteId: null,
    });
  }

  if (ownerId && !seats.some((s) => s.id === ownerId)) {
    const { data: owner } = await supabase.auth.admin.getUserById(ownerId);
    const meta = (owner?.user?.user_metadata || {}) as Record<string, unknown>;
    seats.unshift({
      id: ownerId,
      name: (typeof meta.name === "string" && meta.name) || owner?.user?.email || "Owner",
      email: owner?.user?.email || "",
      role: "fleet_owner",
      status: "active",
      lastActive: owner?.user?.last_sign_in_at || null,
      isOwner: true,
      inviteId: null,
    });
  }

  const { data: invites } = await platform(supabase)
    .from("pending_invites")
    .select("id, email, metadata, roles(name)")
    .eq("scope_type", "organization")
    .eq("scope_id", organizationId)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const pending: StaffSeat[] = (invites || []).map((row: {
    id: string;
    email: string;
    metadata?: { name?: string };
    roles?: { name?: string };
  }) => ({
    id: `invite:${row.id}`,
    name: row.metadata?.name || row.email,
    email: row.email,
    role: String(row.roles?.name || ""),
    status: "invited" as const,
    lastActive: null,
    isOwner: false,
    inviteId: row.id,
  }));

  return { seats, invites: pending };
}

async function seatFor(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<{ id: string; role: string; status: string } | null> {
  const { data, error } = await platform(supabase)
    .from("user_roles")
    .select("id, status, roles(name)")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", organizationId);
  if (error) throw new Error(error.message);
  const row = (data || []).find((r: { roles?: { name?: string } }) =>
    isTeamRole(String(r.roles?.name || ""))
  ) as { id: string; status: string; roles?: { name?: string } } | undefined;
  if (!row) return null;
  return { id: row.id, role: String(row.roles?.name || ""), status: row.status };
}

export async function changeStaffRole(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    targetId: string;
    role: TeamRole;
    sectionOverrides?: Record<string, unknown> | null;
    audit: AuditCtx;
  },
): Promise<void> {
  const seat = await seatFor(supabase, input.organizationId, input.targetId);
  if (!seat) {
    const err = new Error("Role changes apply to staff only");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  const target = await roleByName(supabase, input.role);
  const level = await actorLevel(supabase, input.actorRole);
  if (!target || !canGrantRole(level, target.level, input.role)) {
    const err = new Error("You cannot grant that role");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  const { error } = await platform(supabase)
    .from("user_roles")
    .update({ role_id: target.id })
    .eq("id", seat.id);
  if (error) throw new Error(error.message);
  await mirrorStaffOrg(supabase, input.targetId, {
    organizationId: input.organizationId,
    productLine: input.role.startsWith("enterprise_") ? "enterprise" : "fleet",
    sectionOverrides: input.sectionOverrides ?? undefined,
  });
  invalidateAccessCache(input.targetId);
  await audit({
    actorUserId: input.actorId,
    targetUserId: input.targetId,
    action: "team.staff.role_changed",
    metadata: { from: seat.role, to: input.role, organizationId: input.organizationId },
    ...input.audit,
  });
}

export async function setStaffStatus(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    actorId: string;
    targetId: string;
    status: "active" | "suspended";
    audit: AuditCtx;
  },
): Promise<void> {
  const seat = await seatFor(supabase, input.organizationId, input.targetId);
  if (!seat) {
    const err = new Error("Only a staff seat can be suspended");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  const { error } = await platform(supabase)
    .from("user_roles")
    .update({ status: input.status })
    .eq("id", seat.id);
  if (error) throw new Error(error.message);
  if (input.status === "suspended") {
    await clearMirroredStaffRole(supabase, input.targetId);
    await supabase.auth.admin.signOut(input.targetId, "global");
  }
  invalidateAccessCache(input.targetId);
  await audit({
    actorUserId: input.actorId,
    targetUserId: input.targetId,
    action: input.status === "suspended" ? "team.staff.suspended" : "team.staff.reactivated",
    metadata: { organizationId: input.organizationId },
    ...input.audit,
  });
}

export async function removeStaffSeat(
  supabase: SupabaseClient,
  input: { organizationId: string; actorId: string; targetId: string; audit: AuditCtx },
): Promise<void> {
  const { data: org } = await supabase
    .from("organizations")
    .select("owner_id")
    .eq("id", input.organizationId)
    .maybeSingle();
  if (org?.owner_id && String(org.owner_id) === input.targetId) {
    const err = new Error("Cannot remove the organization owner");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  const seat = await seatFor(supabase, input.organizationId, input.targetId);
  if (!seat) {
    const err = new Error("Only a staff seat can be removed here");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  if (isOwnerRole(seat.role)) {
    const err = new Error("Cannot remove the organization owner");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  const { error } = await platform(supabase).from("user_roles").delete().eq("id", seat.id);
  if (error) throw new Error(error.message);

  const { data: userData } = await supabase.auth.admin.getUserById(input.targetId);
  const app = { ...(userData?.user?.app_metadata || {}) } as Record<string, unknown>;
  if (isTeamRole(String(app.role || "")) || MIRRORED_STAFF.has(String(app.role || ""))) {
    delete app.role;
  }
  if (Array.isArray(app.roles)) {
    app.roles = app.roles.filter((role) => typeof role === "string" && !MIRRORED_STAFF.has(role));
  }
  await supabase.auth.admin.updateUserById(input.targetId, { app_metadata: app });
  invalidateAccessCache(input.targetId);
  await supabase.auth.admin.signOut(input.targetId, "global");
  await audit({
    actorUserId: input.actorId,
    targetUserId: input.targetId,
    action: "team.staff.removed",
    metadata: { role: seat.role, organizationId: input.organizationId },
    ...input.audit,
  });
}

export async function sendStaffResetEmail(
  supabase: SupabaseClient,
  input: { organizationId: string; actorId: string; targetId: string; audit: AuditCtx },
): Promise<void> {
  const seat = await seatFor(supabase, input.organizationId, input.targetId);
  if (!seat || seat.status !== "active") {
    const err = new Error("Password reset emails are only for active staff in your company");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await countRecent(
    supabase,
    "team.staff.reset_email",
    input.actorId,
    hourAgo,
    input.targetId,
  );
  if (recent >= 3) {
    const err = new Error("Too many reset emails for this person. Try again later.");
    (err as Error & { status?: number }).status = 429;
    throw err;
  }
  const { data: userData } = await supabase.auth.admin.getUserById(input.targetId);
  const email = userData?.user?.email;
  if (!email) {
    const err = new Error("This person has no email");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!base || !anon) throw new Error("Auth email is not configured");
  const res = await fetch(`${base}/auth/v1/recover`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = new Error("Could not send the reset email");
    (err as Error & { status?: number }).status = 502;
    throw err;
  }
  await audit({
    actorUserId: input.actorId,
    targetUserId: input.targetId,
    action: "team.staff.reset_email",
    metadata: { organizationId: input.organizationId },
    ...input.audit,
  });
}

export async function revokeStaffInvite(
  supabase: SupabaseClient,
  input: { organizationId: string; actorId: string; inviteId: string; audit: AuditCtx },
): Promise<void> {
  const { data, error } = await platform(supabase)
    .from("pending_invites")
    .update({ revoked_at: new Date().toISOString(), revoked_by: input.actorId })
    .eq("id", input.inviteId)
    .eq("scope_type", "organization")
    .eq("scope_id", input.organizationId)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const err = new Error("Invite not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  await audit({
    actorUserId: input.actorId,
    action: "team.staff.invite_revoked",
    resourceId: input.inviteId,
    metadata: { organizationId: input.organizationId },
    ...input.audit,
  });
}

export async function resendStaffInvite(
  supabase: SupabaseClient,
  input: { organizationId: string; actorId: string; inviteId: string; audit: AuditCtx },
): Promise<void> {
  const { data, error } = await platform(supabase)
    .from("pending_invites")
    .select("id, email, metadata")
    .eq("id", input.inviteId)
    .eq("scope_type", "organization")
    .eq("scope_id", input.organizationId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const err = new Error("Invite not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await platform(supabase).from("pending_invites").update({ expires_at: expires }).eq("id", data.id);
  const existing = await findAuthUserByEmail(String(data.email));
  const meta = (data.metadata || {}) as { productLine?: string };
  const line = meta.productLine === "enterprise" ? "enterprise" : "fleet";
  if (existing) {
    await sendStaffInviteNotice(String(data.email), "", line);
  } else {
    await supabase.auth.admin.inviteUserByEmail(String(data.email)).catch(() => undefined);
  }
  await audit({
    actorUserId: input.actorId,
    action: "team.staff.invite_resent",
    resourceId: input.inviteId,
    metadata: { organizationId: input.organizationId },
    ...input.audit,
  });
}

export async function invitesForEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<Array<{ id: string; role: string; organizationId: string; organizationName: string }>> {
  const { data, error } = await platform(supabase)
    .from("pending_invites")
    .select("id, scope_id, roles(name)")
    .eq("email", email.trim().toLowerCase())
    .eq("scope_type", "organization")
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());
  if (error) throw new Error(error.message);
  const rows = data || [];
  const out = [];
  for (const row of rows as Array<{ id: string; scope_id: string; roles?: { name?: string } }>) {
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", row.scope_id)
      .maybeSingle();
    out.push({
      id: row.id,
      role: String(row.roles?.name || ""),
      organizationId: row.scope_id,
      organizationName: String(org?.name || "Your company"),
    });
  }
  return out;
}

export async function pendingOwnershipTransfer(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string; organizationName: string; fromName: string } | null> {
  const { data, error } = await platform(supabase)
    .from("ownership_transfers")
    .select("id, organization_id, from_user_id")
    .eq("to_user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data || [])[0] as { id?: string; organization_id?: string; from_user_id?: string } | undefined;
  if (!row?.id || !row.organization_id) return null;
  const { data: org } = await supabase.from("organizations").select("name").eq("id", row.organization_id).maybeSingle();
  let fromName = "The owner";
  if (row.from_user_id) {
    const { data: from } = await supabase.auth.admin.getUserById(row.from_user_id);
    const meta = (from?.user?.user_metadata || {}) as Record<string, unknown>;
    if (typeof meta.name === "string" && meta.name) fromName = meta.name;
    else if (from?.user?.email) fromName = from.user.email;
  }
  return {
    id: row.id,
    organizationName: String(org?.name || "your company"),
    fromName,
  };
}

export async function acceptOwnershipTransfer(
  supabase: SupabaseClient,
  input: { transferId: string; userId: string; audit: AuditCtx },
): Promise<void> {
  const { data: row, error } = await platform(supabase)
    .from("ownership_transfers")
    .select("*")
    .eq("id", input.transferId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.status !== "pending") {
    const err = new Error("Transfer is not open");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  if (String(row.to_user_id) !== input.userId) {
    const err = new Error("This transfer is for someone else");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const err = new Error("Transfer expired");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  const organizationId = String(row.organization_id);
  const fromUserId = String(row.from_user_id);
  const { data: org } = await supabase
    .from("organizations")
    .select("owner_id, product_line")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org || String(org.owner_id) !== fromUserId) {
    const err = new Error("Transfer is not open");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  const managerName = org.product_line === "enterprise" ? "enterprise_dispatcher" : "fleet_manager";
  const manager = await roleByName(supabase, managerName);
  if (!manager) throw new Error("Manager role is not configured");
  const existing = await seatFor(supabase, organizationId, fromUserId);
  if (existing) {
    const { error: seatErr } = await platform(supabase)
      .from("user_roles")
      .update({ role_id: manager.id, status: "active" })
      .eq("id", existing.id);
    if (seatErr) throw new Error(seatErr.message);
  } else {
    const { error: seatErr } = await platform(supabase).from("user_roles").insert({
      user_id: fromUserId,
      role_id: manager.id,
      scope_type: "organization",
      scope_id: organizationId,
      granted_by: input.userId,
      status: "active",
    });
    if (seatErr && !/duplicate|unique/i.test(seatErr.message)) throw new Error(seatErr.message);
  }
  await clearMirroredStaffRole(supabase, fromUserId);
  const { error: orgErr } = await supabase
    .from("organizations")
    .update({ owner_id: input.userId })
    .eq("id", organizationId)
    .eq("owner_id", fromUserId);
  if (orgErr) throw new Error(orgErr.message);
  await platform(supabase).from("ownership_transfers").update({
    status: "accepted",
    accepted_at: new Date().toISOString(),
  }).eq("id", row.id);
  invalidateAccessCache(fromUserId);
  invalidateAccessCache(input.userId);
  await audit({
    actorUserId: input.userId,
    targetUserId: fromUserId,
    action: "team.ownership.accepted",
    metadata: { organizationId, managerRole: managerName },
    ...input.audit,
  });
  await audit({
    actorUserId: fromUserId,
    targetUserId: input.userId,
    action: "team.ownership.handed_over",
    metadata: { organizationId },
    ...input.audit,
  });
}

export async function cancelOwnershipTransfer(
  supabase: SupabaseClient,
  input: { transferId: string; userId: string; audit: AuditCtx },
): Promise<void> {
  const { data: row, error } = await platform(supabase)
    .from("ownership_transfers")
    .select("id, status, from_user_id, to_user_id, organization_id")
    .eq("id", input.transferId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.status !== "pending") {
    const err = new Error("Transfer is not open");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  if (String(row.from_user_id) !== input.userId && String(row.to_user_id) !== input.userId) {
    const err = new Error("This transfer is for someone else");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  await platform(supabase).from("ownership_transfers").update({ status: "cancelled" }).eq("id", row.id);
  await audit({
    actorUserId: input.userId,
    action: "team.ownership.cancelled",
    metadata: { organizationId: row.organization_id, transferId: row.id },
    ...input.audit,
  });
}

export async function sendOwnershipNotice(
  supabase: SupabaseClient,
  toUserId: string,
  organizationId: string,
): Promise<boolean> {
  const { data: userData } = await supabase.auth.admin.getUserById(toUserId);
  const email = userData?.user?.email;
  if (!email) return false;
  const { data: org } = await supabase.from("organizations").select("name, product_line").eq("id", organizationId).maybeSingle();
  const line = org?.product_line === "enterprise" ? "enterprise" : "fleet";
  const link = line === "enterprise" ? "https://roamenterprise.co" : "https://roamfleet.co";
  const company = String(org?.name || "your company");
  try {
    const { sendNotificationEmail } = await import("../delivery/admin/merchantAdminShared.ts");
    const sent = await sendNotificationEmail({
      to: email,
      subject: `Become the owner of ${company}`,
      text: `Sign in at ${link} to accept ownership of ${company}. You can also decline.`,
      html: `<p>You are asked to become the owner of ${company}.</p><p><a href="${link}">Sign in to accept or decline</a>.</p>`,
    });
    return sent.sent;
  } catch {
    return false;
  }
}
