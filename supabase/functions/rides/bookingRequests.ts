import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import { generatePublicCode, generateToken, normalizePhoneE164, roamTagUrl } from "./rideAccess.ts";

type BookingRequestDeps = {
  getContactsDb: () => Promise<RidesContactsDb>;
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

/** Roam Tag share links are valid for 12 hours. */
export const ROAM_TAG_LINK_TTL_HOURS = 12;

const ACTIVE_STATUSES = ["pending", "claimed"] as const;

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) <= new Date();
}

async function expireIfNeeded(
  db: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (row.status === "expired" || row.status === "consumed" || row.status === "cancelled") {
    return row;
  }
  if (!isExpired(String(row.expires_at))) return row;
  await db.from(table).update({
    status: "expired",
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  return { ...row, status: "expired" };
}

async function findActiveForRequester(
  db: SupabaseClient,
  table: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data: rows } = await db.from(table)
    .select("*")
    .eq("requester_user_id", userId)
    .in("status", [...ACTIVE_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1);
  const row = rows?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const fresh = await expireIfNeeded(db, table, row);
  if (fresh.status === "expired") return null;
  return fresh;
}

function publicBookingRequest(row: Record<string, unknown>) {
  return {
    ...row,
    requester_phone: String(row.requester_phone).replace(/\d(?=\d{4})/g, "*"),
  };
}

function toCreateResponse(row: Record<string, unknown>, reused = false) {
  return {
    booking_request: row,
    url: roamTagUrl(String(row.token)),
    public_code: row.public_code,
    reused,
  };
}

export function registerBookingRequestRoutes(app: Hono, deps: BookingRequestDeps) {
  app.get("/v1/booking-requests/me/active", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const { db, tables: t } = await deps.getContactsDb();
    const active = await findActiveForRequester(db, t.booking_requests, auth.user.id);
    if (!active) return c.json({ booking_request: null });
    return c.json({
      booking_request: publicBookingRequest(active),
      url: roamTagUrl(String(active.token)),
      public_code: active.public_code,
    });
  });

  app.post("/v1/booking-requests", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const { db, tables: t } = await deps.getContactsDb();
    const existing = await findActiveForRequester(db, t.booking_requests, auth.user.id);
    if (existing) {
      return c.json(toCreateResponse(existing, true));
    }

    const body = await c.req.json().catch(() => ({}));
    const requesterName = typeof body.requester_name === "string" ? body.requester_name.trim() : "";
    const requesterPhone = typeof body.requester_phone === "string" ? body.requester_phone.trim() : "";
    if (!requesterName || !requesterPhone) return c.json({ error: "invalid_body" }, 400);

    const token = generateToken(16);
    const publicCode = generatePublicCode();
    const expiresAt = new Date(Date.now() + ROAM_TAG_LINK_TTL_HOURS * 3600_000).toISOString();

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

    const { data, error } = await db.from(t.booking_requests).insert(row).select("*").single();
    if (error || !data) {
      if (error?.code === "23505") {
        const again = await findActiveForRequester(db, t.booking_requests, auth.user.id);
        if (again) return c.json(toCreateResponse(again, true));
      }
      return c.json({ error: "insert_failed" }, 500);
    }

    await deps.audit(null, auth.user.id, "booking_request_created", {
      booking_request_id: data.id,
      public_code: publicCode,
    });

    return c.json(toCreateResponse(data as Record<string, unknown>));
  });

  app.get("/v1/booking-requests/:token", async (c) => {
    const token = c.req.param("token");
    const { db, tables: t } = await deps.getContactsDb();
    const { data, error } = await db.from(t.booking_requests)
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (error || !data) return c.json({ error: "not_found" }, 404);

    const row = await expireIfNeeded(db, t.booking_requests, data as Record<string, unknown>);
    if (row.status === "consumed") return c.json({ error: "consumed" }, 410);
    if (row.status === "expired") return c.json({ error: "expired" }, 410);
    if (row.status !== "pending" && row.status !== "claimed") {
      return c.json({ error: "unavailable", status: row.status }, 410);
    }

    return c.json({ booking_request: publicBookingRequest(row) });
  });

  app.post("/v1/booking-requests/:token/claim", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const token = c.req.param("token");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: br } = await db.from(t.booking_requests).select("*").eq("token", token).maybeSingle();
    if (!br) return c.json({ error: "not_found" }, 404);

    const row = await expireIfNeeded(db, t.booking_requests, br as Record<string, unknown>);
    if (row.status === "consumed") return c.json({ error: "consumed" }, 410);
    if (row.status === "expired") return c.json({ error: "expired" }, 410);
    if (row.status !== "pending") return c.json({ error: "not_pending", status: row.status }, 409);
    if (row.requester_user_id === auth.user.id) {
      return c.json({ error: "cannot_claim_own_request" }, 400);
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await db.from(t.booking_requests).update({
      status: "claimed",
      claimed_by_user_id: auth.user.id,
      updated_at: now,
    }).eq("id", row.id).eq("status", "pending").select("*").single();

    if (error || !updated) return c.json({ error: "claim_failed" }, 409);
    await deps.audit(null, auth.user.id, "booking_request_claimed", { booking_request_id: row.id });

    return c.json({ booking_request: updated });
  });
}

/** Links ride to request when booker starts matching — link stays valid until digital payment. */
export async function linkBookingRequestToRide(
  getContactsDb: () => Promise<RidesContactsDb>,
  bookingRequestId: string,
  rideRequestId: string,
): Promise<void> {
  const { db, tables: t } = await getContactsDb();
  await db.from(t.booking_requests).update({
    ride_request_id: rideRequestId,
    updated_at: new Date().toISOString(),
  }).eq("id", bookingRequestId).in("status", ["claimed", "pending"]);
}

/** Consumes link after trip is paid digitally (card / wallet). */
export async function markBookingRequestConsumed(
  getContactsDb: () => Promise<RidesContactsDb>,
  bookingRequestId: string,
  rideRequestId: string,
): Promise<void> {
  const { db, tables: t } = await getContactsDb();
  const now = new Date().toISOString();
  await db.from(t.booking_requests).update({
    status: "consumed",
    ride_request_id: rideRequestId,
    consumed_at: now,
    updated_at: now,
  }).eq("id", bookingRequestId).neq("status", "consumed");
}

/** If a Roam Tag ride is cancelled before payment, release the link for another attempt. */
export async function releaseBookingRequestAfterRideCancelled(
  getContactsDb: () => Promise<RidesContactsDb>,
  bookingRequestId: string,
): Promise<void> {
  const { db, tables: t } = await getContactsDb();
  const { data: br } = await db.from(t.booking_requests).select("id, status, expires_at")
    .eq("id", bookingRequestId).maybeSingle();
  if (!br || br.status === "consumed") return;
  if (isExpired(String(br.expires_at))) {
    await db.from(t.booking_requests).update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", bookingRequestId);
    return;
  }
  await db.from(t.booking_requests).update({
    status: "claimed",
    ride_request_id: null,
    updated_at: new Date().toISOString(),
  }).eq("id", bookingRequestId).in("status", ["claimed", "booked"]);
}

/** @deprecated Use linkBookingRequestToRide + markBookingRequestConsumed */
export async function markBookingRequestBooked(
  getContactsDb: () => Promise<RidesContactsDb>,
  bookingRequestId: string,
  rideRequestId: string,
): Promise<void> {
  await linkBookingRequestToRide(getContactsDb, bookingRequestId, rideRequestId);
}

export function isDigitalRidePayment(method: unknown): boolean {
  return method === "card";
}
