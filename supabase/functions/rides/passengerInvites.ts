import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";
import {
  generateToken,
  normalizePhoneE164,
  passengerInviteUrl,
  phonesMatch,
} from "./rideAccess.ts";
import { canAccessRide, getRideParticipantRole } from "./rideAccess.ts";
import { sendRideNotification } from "./rideNotifications.ts";

type InviteDeps = {
  svc: () => SupabaseClient;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: 401 }
  >;
  loadRideRequestById: (id: string) => Promise<Record<string, unknown> | null>;
  audit: (
    rideId: string | null,
    actor: string | undefined,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
};

const INVITE_TTL_HOURS = 48;

export function registerPassengerInviteRoutes(app: Hono, deps: InviteDeps) {
  app.post("/v1/requests/:id/passenger-invite", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const rideId = c.req.param("id");
    const ride = await deps.loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);
    if (ride.rider_user_id !== auth.user.id) return jsonEdgeForbidden(c, "forbidden");
    if (!ride.guest_passenger_phone) {
      return c.json({ error: "no_guest_passenger" }, 400);
    }
    if (["completed", "cancelled"].includes(String(ride.status))) {
      return c.json({ error: "ride_terminal" }, 409);
    }

    const db = deps.svc();
    const { data: existing } = await db.from("ride_passenger_invites")
      .select("*")
      .eq("ride_request_id", rideId)
      .is("claimed_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existing) {
      return c.json({
        invite: {
          token: existing.token,
          url: passengerInviteUrl(String(existing.token)),
          expires_at: existing.expires_at,
          ride_request_id: rideId,
        },
      });
    }

    const token = generateToken(16);
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString();
    const phone = normalizePhoneE164(String(ride.guest_passenger_phone));

    const { data: invite, error } = await db.from("ride_passenger_invites").insert({
      ride_request_id: rideId,
      token,
      phone_e164: phone,
      expires_at: expiresAt,
    }).select("*").single();

    if (error || !invite) return c.json({ error: "insert_failed" }, 500);

    await deps.audit(rideId, auth.user.id, "passenger_invite_created", { token });
    await sendRideNotification({
      to: phone,
      template: "passenger_invite",
      payload: {
        url: passengerInviteUrl(token),
        guest_name: ride.guest_passenger_name,
      },
    });

    return c.json({
      invite: {
        token: invite.token,
        url: passengerInviteUrl(String(invite.token)),
        expires_at: invite.expires_at,
        ride_request_id: rideId,
      },
    });
  });

  app.get("/v1/passenger-invites/:token", async (c) => {
    const token = c.req.param("token");
    const { data: invite } = await deps.svc().from("ride_passenger_invites")
      .select("*, ride_request_id")
      .eq("token", token)
      .maybeSingle();
    if (!invite) return c.json({ error: "not_found" }, 404);
    if (invite.claimed_at) return c.json({ error: "already_claimed" }, 409);
    if (new Date(String(invite.expires_at)) <= new Date()) {
      return c.json({ error: "expired" }, 410);
    }
    const ride = await deps.loadRideRequestById(String(invite.ride_request_id));
    if (!ride || ["completed", "cancelled"].includes(String(ride.status))) {
      return c.json({ error: "ride_unavailable" }, 410);
    }
    return c.json({
      invite: {
        token: invite.token,
        expires_at: invite.expires_at,
        guest_name: ride.guest_passenger_name,
        pickup_address: ride.pickup_address,
        dropoff_address: ride.dropoff_address,
        phone_masked: String(invite.phone_e164).replace(/\d(?=\d{4})/g, "*"),
      },
    });
  });

  app.post("/v1/passenger-invites/:token/claim", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const token = c.req.param("token");
    const db = deps.svc();
    const { data: invite } = await db.from("ride_passenger_invites")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (!invite) return c.json({ error: "not_found" }, 404);
    if (invite.claimed_at) return c.json({ error: "already_claimed" }, 409);
    if (new Date(String(invite.expires_at)) <= new Date()) {
      return c.json({ error: "expired" }, 410);
    }

    const userPhone = (auth.user as { phone?: string }).phone ??
      (await db.auth.admin.getUserById(auth.user.id)).data.user?.phone;
    if (!userPhone || !phonesMatch(userPhone, String(invite.phone_e164))) {
      return c.json({ error: "phone_mismatch", message: "Sign in with the phone number that received the invite." }, 403);
    }

    const rideId = String(invite.ride_request_id);
    const ride = await deps.loadRideRequestById(rideId);
    if (!ride || ["completed", "cancelled"].includes(String(ride.status))) {
      return c.json({ error: "ride_unavailable" }, 410);
    }

    const now = new Date().toISOString();
    await db.from("ride_requests").update({
      passenger_user_id: auth.user.id,
      updated_at: now,
    }).eq("id", rideId);

    await db.from("ride_passenger_invites").update({
      claimed_by_user_id: auth.user.id,
      claimed_at: now,
    }).eq("id", invite.id);

    await deps.audit(rideId, auth.user.id, "passenger_invite_claimed", { token });

    return c.json({
      ride_id: rideId,
      passenger_user_id: auth.user.id,
    });
  });
}

export { canAccessRide, getRideParticipantRole };
