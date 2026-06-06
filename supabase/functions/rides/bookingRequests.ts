import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";
import { generatePublicCode, generateToken, normalizePhoneE164, roamTagUrl } from "./rideAccess.ts";

type BookingRequestDeps = {
  svc: () => SupabaseClient;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: 401 }
  >;
  audit: (
    rideId: string | null,
    actor: string | undefined,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
};

const TAG_TTL_HOURS = 24;

export function registerBookingRequestRoutes(app: Hono, deps: BookingRequestDeps) {
  app.post("/v1/booking-requests", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const body = await c.req.json().catch(() => ({}));
    const requesterName = typeof body.requester_name === "string" ? body.requester_name.trim() : "";
    const requesterPhone = typeof body.requester_phone === "string" ? body.requester_phone.trim() : "";
    if (!requesterName || !requesterPhone) return c.json({ error: "invalid_body" }, 400);

    const token = generateToken(16);
    const publicCode = generatePublicCode();
    const expiresAt = new Date(Date.now() + TAG_TTL_HOURS * 3600_000).toISOString();

    const row = {
      token,
      public_code: publicCode,
      requester_user_id: auth.user.id,
      requester_name: requesterName,
      requester_phone: normalizePhoneE164(requesterPhone),
      pickup_lat: body.pickup_lat != null ? Number(body.pickup_lat) : null,
      pickup_lng: body.pickup_lng != null ? Number(body.pickup_lng) : null,
      pickup_address: typeof body.pickup_address === "string" ? body.pickup_address : null,
      dropoff_lat: body.dropoff_lat != null ? Number(body.dropoff_lat) : null,
      dropoff_lng: body.dropoff_lng != null ? Number(body.dropoff_lng) : null,
      dropoff_address: typeof body.dropoff_address === "string" ? body.dropoff_address : null,
      vehicle_option: typeof body.vehicle_option === "string" ? body.vehicle_option : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      status: "pending",
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await deps.svc().from("booking_requests").insert(row).select("*").single();
    if (error || !data) return c.json({ error: "insert_failed" }, 500);

    await deps.audit(null, auth.user.id, "booking_request_created", {
      booking_request_id: data.id,
      public_code: publicCode,
    });

    return c.json({
      booking_request: data,
      url: roamTagUrl(token),
      public_code: publicCode,
    });
  });

  app.get("/v1/booking-requests/:token", async (c) => {
    const token = c.req.param("token");
    const { data, error } = await deps.svc().from("booking_requests")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (error || !data) return c.json({ error: "not_found" }, 404);
    if (data.status !== "pending" && data.status !== "claimed") {
      return c.json({ error: "unavailable", status: data.status }, 410);
    }
    if (new Date(String(data.expires_at)) <= new Date()) {
      return c.json({ error: "expired" }, 410);
    }
    return c.json({
      booking_request: {
        ...data,
        requester_phone: String(data.requester_phone).replace(/\d(?=\d{4})/g, "*"),
      },
    });
  });

  app.post("/v1/booking-requests/:token/claim", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const token = c.req.param("token");
    const db = deps.svc();
    const { data: br } = await db.from("booking_requests").select("*").eq("token", token).maybeSingle();
    if (!br) return c.json({ error: "not_found" }, 404);
    if (br.status !== "pending") return c.json({ error: "not_pending", status: br.status }, 409);
    if (new Date(String(br.expires_at)) <= new Date()) {
      await db.from("booking_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", br.id);
      return c.json({ error: "expired" }, 410);
    }
    if (br.requester_user_id === auth.user.id) {
      return c.json({ error: "cannot_claim_own_request" }, 400);
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await db.from("booking_requests").update({
      status: "claimed",
      claimed_by_user_id: auth.user.id,
      updated_at: now,
    }).eq("id", br.id).eq("status", "pending").select("*").single();

    if (error || !updated) return c.json({ error: "claim_failed" }, 409);
    await deps.audit(null, auth.user.id, "booking_request_claimed", { booking_request_id: br.id });

    return c.json({ booking_request: updated });
  });
}

export async function markBookingRequestBooked(
  db: SupabaseClient,
  bookingRequestId: string,
  rideRequestId: string,
): Promise<void> {
  await db.from("booking_requests").update({
    status: "booked",
    ride_request_id: rideRequestId,
    updated_at: new Date().toISOString(),
  }).eq("id", bookingRequestId);
}
