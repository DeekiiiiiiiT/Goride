import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import { generatePublicCode, generateToken, normalizePhoneE164 } from "./rideAccess.ts";

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

function serviceAuth() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function requesterFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "Rider";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

async function loadRequesterPublicProfile(
  db: SupabaseClient,
  tagsTable: string,
  requesterUserId: string | null | undefined,
  requesterName: string,
) {
  let customTagName: string | null = null;
  if (requesterUserId) {
    const { data: tagRow } = await db.from(tagsTable)
      .select("custom_tag_name")
      .eq("user_id", requesterUserId)
      .maybeSingle();
    customTagName = (tagRow?.custom_tag_name as string | null) ?? null;
  }

  let avatarUrl: string | null = null;
  if (requesterUserId) {
    try {
      const { data } = await serviceAuth().auth.admin.getUserById(String(requesterUserId));
      const meta = data.user?.user_metadata as Record<string, unknown> | undefined;
      avatarUrl =
        (typeof meta?.avatar_url === "string" && meta.avatar_url.trim()) ||
        (typeof meta?.picture === "string" && meta.picture.trim()) ||
        null;
    } catch {
      /* optional */
    }
  }

  return {
    first_name: requesterFirstName(requesterName),
    custom_tag_name: customTagName,
    avatar_url: avatarUrl,
  };
}

/** Preview for claimers — no street addresses or coordinates. */
function sanitizeBookingRequestPreview(row: Record<string, unknown>) {
  const masked = publicBookingRequest(row);
  return {
    id: masked.id,
    token: masked.token,
    public_code: masked.public_code,
    requester_name: masked.requester_name,
    status: masked.status,
    expires_at: masked.expires_at,
    vehicle_option: masked.vehicle_option ?? null,
    has_trip_route: masked.pickup_lat != null && masked.pickup_lng != null
      && masked.dropoff_lat != null && masked.dropoff_lng != null,
  };
}

/** Claim response — coords for quoting, no street addresses. */
function sanitizeBookingRequestClaim(row: Record<string, unknown>) {
  const out = { ...publicBookingRequest(row) } as Record<string, unknown>;
  delete out.pickup_address;
  delete out.dropoff_address;
  delete out.notes;
  return out;
}

function toCreateResponse(row: Record<string, unknown>, reused = false) {
  return {
    booking_request: row,
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

/** When a trip-intent ride is system-cancelled, close the intent so the hub can clear it. */
export async function syncBookingRequestAfterSystemRideCancel(
  getContactsDb: () => Promise<RidesContactsDb>,
  bookingRequestId: string,
): Promise<void> {
  const { db, tables: t } = await getContactsDb();
  const { data: br } = await db.from(t.booking_requests).select("id, status")
    .eq("id", bookingRequestId).maybeSingle();
  if (!br || !["booked", "claimed"].includes(String(br.status))) return;
  await db.from(t.booking_requests).update({
    status: "cancelled",
    ride_request_id: null,
    updated_at: new Date().toISOString(),
  }).eq("id", bookingRequestId);
}

/** When a linked ride is cancelled, close the intent so all parties clear the hub. */
export async function releaseBookingRequestAfterRideCancelled(
  getContactsDb: () => Promise<RidesContactsDb>,
  bookingRequestId: string,
): Promise<void> {
  const { db, tables: t } = await getContactsDb();
  const { data: br } = await db.from(t.booking_requests).select("id, status, expires_at, committed_at")
    .eq("id", bookingRequestId).maybeSingle();
  if (!br || br.status === "consumed" || br.status === "cancelled") return;

  const now = new Date().toISOString();
  const wasLive = String(br.status) === "booked" || br.committed_at != null;

  if (wasLive) {
    await db.from(t.booking_requests).update({
      status: "cancelled",
      ride_request_id: null,
      updated_at: now,
    }).eq("id", bookingRequestId);
    return;
  }

  if (isExpired(String(br.expires_at))) {
    await db.from(t.booking_requests).update({ status: "expired", updated_at: now })
      .eq("id", bookingRequestId);
    return;
  }

  await db.from(t.booking_requests).update({
    status: "claimed",
    ride_request_id: null,
    updated_at: now,
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
