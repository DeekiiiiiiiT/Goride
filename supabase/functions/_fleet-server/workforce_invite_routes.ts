/**
 * Fleet workforce invites — drivers and couriers.
 */
import type { Hono } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isFeatureEnabled, FEATURE_FLAGS } from "./feature_flags.ts";

function randomInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function registerWorkforceInviteRoutes(
  app: Hono,
  deps: {
    supabase: SupabaseClient;
    requireAuth: () => unknown;
    getOrgId: (c: { get: (k: string) => unknown }) => string | null;
  },
): void {
  app.post("/make-server-37f42386/workforce/invites", deps.requireAuth() as never, async (c) => {
    try {
      const orgId = deps.getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const enabled = await isFeatureEnabled(FEATURE_FLAGS.RUSH_COURIER_LINK, orgId);
      if (!enabled) return c.json({ error: "Workforce invites not enabled for this org" }, 403);

      const body = await c.req.json();
      const serviceLine = body.serviceLine === "rush_delivery" ? "rush_delivery" : "rideshare";
      const inviteCode = randomInviteCode();

      const { data, error } = await deps.supabase
        .from("fleet_workforce_invites")
        .insert({
          organization_id: orgId,
          service_line: serviceLine,
          invite_code: inviteCode,
          invited_email: body.invitedEmail ?? null,
          invited_phone: body.invitedPhone ?? null,
          created_by: orgId,
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
      return c.json({ invites: data ?? [] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/make-server-37f42386/workforce/invites/accept", async (c) => {
    try {
      const body = await c.req.json();
      const code = String(body.inviteCode ?? body.code ?? "").trim().toUpperCase();
      const userId = String(body.userId ?? "");
      if (!code || !userId) return c.json({ error: "inviteCode and userId required" }, 400);

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

      const fleetId = invite.organization_id as string;
      const serviceLine = String(invite.service_line);

      if (serviceLine === "rush_delivery") {
        await deps.supabase.schema("delivery").from("courier_profiles").upsert({
          user_id: userId,
          mode: "fleet",
          fleet_id: fleetId,
          fleet_joined_at: new Date().toISOString(),
          fleet_role: "courier",
          status: "pending",
        }, { onConflict: "user_id" });
      } else {
        await deps.supabase.from("driver_profiles").upsert({
          user_id: userId,
          mode: "fleet",
          fleet_id: fleetId,
          fleet_joined_at: new Date().toISOString(),
          status: "pending",
        }, { onConflict: "user_id" });
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
}
