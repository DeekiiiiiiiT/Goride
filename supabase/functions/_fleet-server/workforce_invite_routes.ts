/**
 * Fleet workforce invites — drivers and couriers.
 * Supports invite codes + courier Roam Tag targeted invites (in-app Accept/Decline).
 */
import type { Hono } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { RbacUser } from "./rbac_middleware.ts";
import { isFeatureEnabled, FEATURE_FLAGS } from "./feature_flags.ts";
import { checkAcceptRateLimit } from "./workforce_invite_rate_limit.ts";
import type { LinkCourierResult, LinkDriverResult } from "./workforce_link.ts";

function randomInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[bytes[i]! % chars.length];
  return out;
}

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

function rbacFromContext(c: { get: (k: string) => unknown }): RbacUser | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return user?.userId ? user : null;
}

async function orgDisplayName(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  return (data?.name as string | null) ?? null;
}

export function registerWorkforceInviteRoutes(
  app: Hono,
  deps: {
    supabase: SupabaseClient;
    requireAuth: () => unknown;
    getOrgId: (c: { get: (k: string) => unknown }) => string | null;
    linkDriverToFleet: (userId: string, fleetId: string) => Promise<LinkDriverResult>;
    linkCourierToFleet: (userId: string, fleetId: string) => Promise<LinkCourierResult>;
  },
): void {
  app.post("/make-server-37f42386/workforce/invites", deps.requireAuth() as never, async (c) => {
    try {
      const orgId = deps.getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const rbacUser = rbacFromContext(c);
      if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);

      const body = await c.req.json();
      const serviceLine = body.serviceLine === "rush_delivery" ? "rush_delivery" : "rideshare";

      if (serviceLine === "rush_delivery") {
        const enabled = await isFeatureEnabled(FEATURE_FLAGS.RUSH_COURIER_LINK, orgId);
        if (!enabled) return c.json({ error: "Courier workforce invites not enabled for this org" }, 403);
      }

      const inviteCode = randomInviteCode();

      const { data, error } = await deps.supabase
        .from("fleet_workforce_invites")
        .insert({
          organization_id: orgId,
          service_line: serviceLine,
          invite_code: inviteCode,
          invite_kind: "code",
          invited_email: body.invitedEmail ?? null,
          invited_phone: body.invitedPhone ?? null,
          created_by: rbacUser.userId,
        })
        .select()
        .single();

      if (error) throw error;
      return c.json({ invite: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  /** Owner invites a courier by personal Roam Tag → courier Accept/Decline in-app. */
  app.post("/make-server-37f42386/workforce/invites/by-roam-tag", deps.requireAuth() as never, async (c) => {
    try {
      const orgId = deps.getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const rbacUser = rbacFromContext(c);
      if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);

      const body = await c.req.json().catch(() => ({}));
      const serviceLine = body.serviceLine === "rush_delivery" ? "rush_delivery" : null;
      if (serviceLine !== "rush_delivery") {
        return c.json({ error: "Roam Tag invites are only for couriers (rush_delivery)" }, 400);
      }

      const enabled = await isFeatureEnabled(FEATURE_FLAGS.RUSH_COURIER_LINK, orgId);
      if (!enabled) return c.json({ error: "Courier workforce invites not enabled for this org" }, 403);

      const tag = normalizeTag(String(body.roamTag ?? body.tag ?? ""));
      if (!tag) return c.json({ error: "roamTag required" }, 400);

      const { data: tagRow, error: tagErr } = await deps.supabase.schema("delivery")
        .from("courier_roam_tags")
        .select("user_id, custom_tag_name")
        .eq("custom_tag_name", tag)
        .maybeSingle();
      if (tagErr) throw tagErr;
      if (!tagRow?.user_id) return c.json({ error: "Courier Roam Tag not found" }, 404);

      const invitedUserId = tagRow.user_id as string;

      const { data: courier } = await deps.supabase.schema("delivery")
        .from("courier_profiles")
        .select("user_id, mode, fleet_id, display_name")
        .eq("user_id", invitedUserId)
        .maybeSingle();
      if (!courier) {
        return c.json({ error: "That Roam Tag is not linked to a courier profile yet" }, 404);
      }
      if (courier.mode === "fleet" && courier.fleet_id === orgId) {
        return c.json({ error: "Courier is already in your fleet" }, 409);
      }
      if (courier.mode === "fleet" && courier.fleet_id && courier.fleet_id !== orgId) {
        return c.json({ error: "Courier is already linked to another fleet" }, 409);
      }

      const { data: existingPending } = await deps.supabase
        .from("fleet_workforce_invites")
        .select("id")
        .eq("organization_id", orgId)
        .eq("invited_user_id", invitedUserId)
        .eq("service_line", "rush_delivery")
        .eq("status", "pending")
        .maybeSingle();
      if (existingPending) {
        return c.json({ error: "A pending invite already exists for this courier", invite: existingPending }, 409);
      }

      let inviteCode = randomInviteCode();
      let data: Record<string, unknown> | null = null;
      let lastError: { message?: string; code?: string } | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        inviteCode = randomInviteCode();
        const res = await deps.supabase
          .from("fleet_workforce_invites")
          .insert({
            organization_id: orgId,
            service_line: "rush_delivery",
            invite_code: inviteCode,
            invite_kind: "roam_tag",
            invited_user_id: invitedUserId,
            created_by: rbacUser.userId,
          })
          .select()
          .single();
        if (!res.error && res.data) {
          data = res.data as Record<string, unknown>;
          lastError = null;
          break;
        }
        lastError = res.error;
        if (res.error?.code !== "23505") break;
      }
      if (lastError || !data) throw lastError ?? new Error("Could not create invite");

      return c.json({
        invite: data,
        courier: {
          user_id: invitedUserId,
          custom_tag_name: tagRow.custom_tag_name,
          display_name: courier.display_name ?? null,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/make-server-37f42386/workforce/invites", deps.requireAuth() as never, async (c) => {
    try {
      const orgId = deps.getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const { data, error } = await deps.supabase
        .from("fleet_workforce_invites")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const invites = data ?? [];
      const userIds = [
        ...new Set(
          invites
            .map((i: { invited_user_id?: string | null }) => i.invited_user_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      let tagByUser = new Map<string, string>();
      if (userIds.length) {
        const { data: tags } = await deps.supabase.schema("delivery")
          .from("courier_roam_tags")
          .select("user_id, custom_tag_name")
          .in("user_id", userIds);
        tagByUser = new Map(
          (tags ?? [])
            .filter((t: { custom_tag_name?: string | null }) => t.custom_tag_name)
            .map((t: { user_id: string; custom_tag_name: string }) => [t.user_id, t.custom_tag_name]),
        );
      }

      return c.json({
        invites: invites.map((inv: Record<string, unknown>) => ({
          ...inv,
          invited_roam_tag: inv.invited_user_id
            ? tagByUser.get(String(inv.invited_user_id)) ?? null
            : null,
        })),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  /** Courier inbox: pending Roam Tag invites addressed to me. */
  app.get("/make-server-37f42386/workforce/invites/mine", deps.requireAuth() as never, async (c) => {
    try {
      const rbacUser = rbacFromContext(c);
      if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);

      const { data, error } = await deps.supabase
        .from("fleet_workforce_invites")
        .select("*")
        .eq("invited_user_id", rbacUser.userId)
        .eq("status", "pending")
        .eq("invite_kind", "roam_tag")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const enriched = await Promise.all(
        (data ?? []).map(async (inv: Record<string, unknown>) => {
          const orgId = String(inv.organization_id);
          const name = await orgDisplayName(deps.supabase, orgId);
          return {
            id: inv.id,
            organization_id: orgId,
            organization_name: name,
            service_line: inv.service_line,
            invite_kind: inv.invite_kind,
            status: inv.status,
            created_at: inv.created_at,
            expires_at: inv.expires_at,
          };
        }),
      );

      return c.json({ invites: enriched });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/make-server-37f42386/workforce/invites/accept", deps.requireAuth() as never, async (c) => {
    try {
      const rbacUser = rbacFromContext(c);
      if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);

      const userId = rbacUser.userId;
      if (!(await checkAcceptRateLimit(userId))) {
        return c.json({ error: "Too many invite attempts. Try again later." }, 429);
      }

      const body = await c.req.json();
      const code = String(body.inviteCode ?? body.code ?? "").trim().toUpperCase();
      if (!code) return c.json({ error: "inviteCode required" }, 400);

      const { data: invite, error: invErr } = await deps.supabase
        .from("fleet_workforce_invites")
        .select("*")
        .eq("invite_code", code)
        .eq("status", "pending")
        .maybeSingle();

      if (invErr) throw invErr;
      if (!invite) return c.json({ error: "Invalid or expired invite" }, 404);
      if (new Date(String(invite.expires_at)) < new Date()) {
        return c.json({ error: "Invite expired" }, 410);
      }

      // Roam-tag invites must be accepted via /invites/:id/accept
      if (invite.invite_kind === "roam_tag") {
        return c.json({ error: "This invite must be accepted in the courier app inbox" }, 400);
      }

      const invitedEmail = invite.invited_email ? String(invite.invited_email).trim().toLowerCase() : null;
      const invitedPhone = invite.invited_phone ? String(invite.invited_phone).replace(/\D/g, "") : null;
      if (invitedEmail && rbacUser.email.trim().toLowerCase() !== invitedEmail) {
        return c.json({ error: "Invite is bound to a different email address" }, 403);
      }
      if (invitedPhone) {
        const { data: authUser } = await deps.supabase.auth.admin.getUserById(userId);
        const userPhone = authUser?.user?.phone?.replace(/\D/g, "") ?? "";
        if (userPhone && userPhone !== invitedPhone) {
          return c.json({ error: "Invite is bound to a different phone number" }, 403);
        }
      }

      const fleetId = invite.organization_id as string;
      const serviceLine = String(invite.service_line);

      if (serviceLine === "rush_delivery") {
        const linked = await deps.linkCourierToFleet(userId, fleetId);
        if (!linked.success) return c.json({ error: linked.error }, linked.status);
      } else {
        try {
          await deps.linkDriverToFleet(userId, fleetId);
        } catch (e: unknown) {
          const err = e as Error & { status?: number };
          if (err.status === 409) return c.json({ error: err.message }, 409);
          if (err.message === "Fleet not found") return c.json({ error: err.message }, 404);
          throw e;
        }
      }

      await deps.supabase
        .from("fleet_workforce_invites")
        .update({
          status: "accepted",
          accepted_by: userId,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invite.id);

      return c.json({ success: true, fleetId, serviceLine });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/make-server-37f42386/workforce/invites/:id/accept", deps.requireAuth() as never, async (c) => {
    try {
      const rbacUser = rbacFromContext(c);
      if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);

      const userId = rbacUser.userId;
      if (!(await checkAcceptRateLimit(userId))) {
        return c.json({ error: "Too many invite attempts. Try again later." }, 429);
      }

      const inviteId = c.req.param("id");
      const { data: invite, error: invErr } = await deps.supabase
        .from("fleet_workforce_invites")
        .select("*")
        .eq("id", inviteId)
        .eq("status", "pending")
        .maybeSingle();

      if (invErr) throw invErr;
      if (!invite) return c.json({ error: "Invite not found" }, 404);
      if (new Date(String(invite.expires_at)) < new Date()) {
        return c.json({ error: "Invite expired" }, 410);
      }
      if (invite.invite_kind !== "roam_tag" || invite.invited_user_id !== userId) {
        return c.json({ error: "Forbidden" }, 403);
      }
      if (String(invite.service_line) !== "rush_delivery") {
        return c.json({ error: "Invalid invite" }, 400);
      }

      const fleetId = invite.organization_id as string;
      const linked = await deps.linkCourierToFleet(userId, fleetId);
      if (!linked.success) return c.json({ error: linked.error }, linked.status);

      await deps.supabase
        .from("fleet_workforce_invites")
        .update({
          status: "accepted",
          accepted_by: userId,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invite.id);

      return c.json({ success: true, fleetId, serviceLine: "rush_delivery" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/make-server-37f42386/workforce/invites/:id/decline", deps.requireAuth() as never, async (c) => {
    try {
      const rbacUser = rbacFromContext(c);
      if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);

      const inviteId = c.req.param("id");
      const { data: invite, error: invErr } = await deps.supabase
        .from("fleet_workforce_invites")
        .select("*")
        .eq("id", inviteId)
        .eq("status", "pending")
        .maybeSingle();

      if (invErr) throw invErr;
      if (!invite) return c.json({ error: "Invite not found" }, 404);
      if (invite.invite_kind !== "roam_tag" || invite.invited_user_id !== rbacUser.userId) {
        return c.json({ error: "Forbidden" }, 403);
      }

      await deps.supabase
        .from("fleet_workforce_invites")
        .update({ status: "declined" })
        .eq("id", invite.id);

      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  /** Fleet owner/manager cancels a pending invite (code or Roam Tag). */
  app.post("/make-server-37f42386/workforce/invites/:id/cancel", deps.requireAuth() as never, async (c) => {
    try {
      const orgId = deps.getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const rbacUser = rbacFromContext(c);
      if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);

      const inviteId = c.req.param("id");
      const { data: invite, error: invErr } = await deps.supabase
        .from("fleet_workforce_invites")
        .select("id, organization_id, status")
        .eq("id", inviteId)
        .eq("organization_id", orgId)
        .eq("status", "pending")
        .maybeSingle();

      if (invErr) throw invErr;
      if (!invite) return c.json({ error: "Invite not found" }, 404);

      const { error: upErr } = await deps.supabase
        .from("fleet_workforce_invites")
        .update({ status: "revoked" })
        .eq("id", invite.id)
        .eq("status", "pending");

      if (upErr) throw upErr;

      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });
}
