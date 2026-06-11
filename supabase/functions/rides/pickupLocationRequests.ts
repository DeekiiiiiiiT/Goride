import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowsPassengerSurface, jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import { isPickupLocationRequestEnabled } from "./pickupLocationRequestFlags.ts";
import { lookupPassengerByPhone } from "./passengerAuthorizations.ts";
import {
  generateToken,
  normalizePhoneE164,
  phonesMatch,
  pickupLocationShareUrl,
} from "./rideAccess.ts";
import { sendRideNotification } from "./rideNotifications.ts";

export const PICKUP_LOCATION_REQUEST_TTL_MS = 15 * 60_000;

const TERMINAL_STATUSES = new Set(["shared", "declined", "expired", "cancelled", "consumed"]);
const INCOMING_LIST_LIMIT = 5;

export type PickupLocationDeliveryChannel = "sms" | "in_app";

export type PickupLocationRequestDeps = {
  getContactsDb: () => Promise<RidesContactsDb>;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string; phone?: string | null; user_metadata?: Record<string, unknown> } } | { error: string; status: 401 }
  >;
  audit: (
    rideId: string | null,
    actor: string | undefined,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  rateLimit?: (key: string, max: number, windowMs: number) => boolean;
  sendNotification?: typeof sendRideNotification;
};

export function resolveDeliveryChannel(riderUserId: string | null): PickupLocationDeliveryChannel {
  return riderUserId ? "in_app" : "sms";
}

export async function notifyRiderForPickupLocationRequest(opts: {
  deliveryChannel: PickupLocationDeliveryChannel;
  phoneE164: string;
  bookerName: string;
  shareUrl: string;
  sendNotification?: typeof sendRideNotification;
}): Promise<{ sms_attempted: boolean; sms_sent: boolean }> {
  if (opts.deliveryChannel === "in_app") {
    return { sms_attempted: false, sms_sent: false };
  }
  const send = opts.sendNotification ?? sendRideNotification;
  const smsOk = await send({
    to: opts.phoneE164,
    template: "pickup_location_request",
    payload: {
      booker_name: opts.bookerName,
      url: opts.shareUrl,
    },
  });
  return { sms_attempted: true, sms_sent: smsOk };
}

export function buildCreatePickupLocationResponse(
  row: Record<string, unknown>,
  delivery: { delivery_channel: PickupLocationDeliveryChannel; sms_attempted: boolean; sms_sent: boolean },
) {
  return {
    request: toPickupLocationRequestDto(row),
    delivery_channel: delivery.delivery_channel,
    sms_attempted: delivery.sms_attempted,
    sms_sent: delivery.sms_sent,
  };
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) <= new Date();
}

function maskPhone(e164: string): string {
  return e164.replace(/\d(?=\d{4})/g, "*");
}

function bookerFirstName(user: { user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata ?? {};
  const full =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    "";
  if (!full) return "Someone";
  return full.split(/\s+/)[0] ?? full;
}

export function toIncomingPickupLocationRequestDto(
  row: Record<string, unknown>,
  bookerName: string | null,
) {
  return {
    id: String(row.id),
    token: String(row.token),
    booker_name: bookerName,
    status: String(row.status),
    expires_at: String(row.expires_at),
    created_at: String(row.created_at),
  };
}

export function toPickupLocationRequestDto(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    token: String(row.token),
    url: pickupLocationShareUrl(String(row.token)),
    status: String(row.status),
    rider_name: String(row.rider_name),
    rider_phone_e164: String(row.rider_phone_e164),
    rider_user_id: row.rider_user_id ? String(row.rider_user_id) : null,
    rider_source: String(row.rider_source),
    rider_contact_id: row.rider_contact_id ? String(row.rider_contact_id) : null,
    pickup_lat: row.pickup_lat != null ? Number(row.pickup_lat) : null,
    pickup_lng: row.pickup_lng != null ? Number(row.pickup_lng) : null,
    pickup_address: row.pickup_address ? String(row.pickup_address) : null,
    accuracy_meters: row.accuracy_meters != null ? Number(row.accuracy_meters) : null,
    shared_at: row.shared_at ? String(row.shared_at) : null,
    expires_at: String(row.expires_at),
    consumed_at: row.consumed_at ? String(row.consumed_at) : null,
  };
}

export async function expirePickupLocationRequestIfNeeded(
  db: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const status = String(row.status);
  if (status !== "pending") return row;
  if (!isExpired(String(row.expires_at))) return row;

  const now = new Date().toISOString();
  await db.from(table).update({ status: "expired", updated_at: now }).eq("id", row.id);
  return { ...row, status: "expired" };
}

async function resolveAuthUserPhone(userId: string): Promise<string | null> {
  const svc = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { data } = await svc.auth.admin.getUserById(userId);
  const phone = data.user?.phone;
  if (!phone) return null;
  try {
    return normalizePhoneE164(phone);
  } catch {
    return null;
  }
}

async function resolveBookerDisplayName(bookerUserId: string): Promise<string | null> {
  try {
    const svc = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: booker } = await svc.auth.admin.getUserById(bookerUserId);
    if (!booker.user) return null;
    return bookerFirstName(booker.user);
  } catch {
    return null;
  }
}

export function rowMatchesIncomingRider(
  row: Record<string, unknown>,
  userId: string,
  userPhoneE164: string | null,
): boolean {
  if (row.rider_user_id && String(row.rider_user_id) === userId) return true;
  if (!userPhoneE164) return false;
  return phonesMatch(String(row.rider_phone_e164), userPhoneE164);
}

async function cancelPriorPendingForPair(
  db: SupabaseClient,
  table: string,
  bookerUserId: string,
  riderPhoneE164: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.from(table).update({ status: "cancelled", updated_at: now })
    .eq("booker_user_id", bookerUserId)
    .eq("rider_phone_e164", riderPhoneE164)
    .eq("status", "pending");
}

export function registerPickupLocationRequestRoutes(app: Hono, deps: PickupLocationRequestDeps) {
  const requirePassenger = async (c: Context) => {
    if (!isPickupLocationRequestEnabled()) {
      return { response: c.json({ error: "pickup_location_request_disabled" }, 404) };
    }
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return { response: c.json({ error: auth.error }, auth.status) };
    if (!allowsPassengerSurface(auth.user)) {
      return { response: jsonEdgeForbidden(c, "forbidden_role") };
    }
    return { user: auth.user, response: null };
  };

  app.post("/v1/pickup-location-requests", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    if (deps.rateLimit) {
      const limited = !deps.rateLimit(`${gate.user!.id}:pickup_location_create`, 10, 3600_000);
      if (limited) return c.json({ error: "rate_limited" }, 429);
    }

    const body = await c.req.json().catch(() => ({}));
    const riderName = typeof body.rider_name === "string" ? body.rider_name.trim() : "";
    const rawPhone = typeof body.rider_phone_e164 === "string" ? body.rider_phone_e164.trim() : "";
    const riderSource = typeof body.rider_source === "string" ? body.rider_source.trim() : "";
    const validSources = new Set(["roam_tag", "roam_contact", "phone_contact"]);

    if (!riderName || !rawPhone || !validSources.has(riderSource)) {
      return c.json({ error: "invalid_body" }, 400);
    }

    let phoneE164: string;
    try {
      phoneE164 = normalizePhoneE164(rawPhone);
    } catch {
      return c.json({ error: "invalid_phone" }, 400);
    }

    let riderUserId: string | null = typeof body.rider_user_id === "string"
      ? body.rider_user_id
      : null;

    if (!riderUserId) {
      const lookup = await lookupPassengerByPhone(phoneE164);
      if (lookup.found && lookup.profile?.user_id) {
        riderUserId = String(lookup.profile.user_id);
      }
    }

    const riderContactId = typeof body.rider_contact_id === "string"
      ? body.rider_contact_id
      : null;

    const { db, tables: t } = await deps.getContactsDb();
    await cancelPriorPendingForPair(db, t.pickup_location_requests, gate.user!.id, phoneE164);

    const token = generateToken(16);
    const expiresAt = new Date(Date.now() + PICKUP_LOCATION_REQUEST_TTL_MS).toISOString();
    const now = new Date().toISOString();

    const { data: row, error } = await db.from(t.pickup_location_requests).insert({
      token,
      booker_user_id: gate.user!.id,
      rider_user_id: riderUserId,
      rider_name: riderName,
      rider_phone_e164: phoneE164,
      rider_source: riderSource,
      rider_contact_id: riderContactId,
      status: "pending",
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    }).select("*").single();

    if (error || !row) return c.json({ error: "insert_failed" }, 500);

    const shareUrl = pickupLocationShareUrl(token);
    const deliveryChannel = resolveDeliveryChannel(riderUserId);
    const notify = await notifyRiderForPickupLocationRequest({
      deliveryChannel,
      phoneE164: phoneE164,
      bookerName: bookerFirstName(gate.user!),
      shareUrl,
      sendNotification: deps.sendNotification,
    });

    await deps.audit(null, gate.user!.id, "pickup_location_request_created", {
      request_id: row.id,
      token,
      rider_user_id: riderUserId,
      delivery_channel: deliveryChannel,
      sms_attempted: notify.sms_attempted,
      sms_sent: notify.sms_sent,
    });

    return c.json(buildCreatePickupLocationResponse(row as Record<string, unknown>, {
      delivery_channel: deliveryChannel,
      sms_attempted: notify.sms_attempted,
      sms_sent: notify.sms_sent,
    }));
  });

  app.get("/v1/pickup-location-requests/incoming", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    if (deps.rateLimit) {
      const limited = !deps.rateLimit(`${gate.user!.id}:pickup_location_incoming`, 60, 60_000);
      if (limited) return c.json({ error: "rate_limited" }, 429);
    }

    const userId = gate.user!.id;
    let userPhoneE164: string | null = null;
    const rawPhone = gate.user!.phone;
    if (rawPhone) {
      try {
        userPhoneE164 = normalizePhoneE164(rawPhone);
      } catch {
        userPhoneE164 = null;
      }
    }
    if (!userPhoneE164) {
      userPhoneE164 = await resolveAuthUserPhone(userId);
    }

    const { db, tables: t } = await deps.getContactsDb();
    const nowIso = new Date().toISOString();

    const queries: Promise<{ data: Record<string, unknown>[] | null }>[] = [
      db.from(t.pickup_location_requests)
        .select("*")
        .eq("status", "pending")
        .gt("expires_at", nowIso)
        .eq("rider_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(INCOMING_LIST_LIMIT),
    ];

    if (userPhoneE164) {
      queries.push(
        db.from(t.pickup_location_requests)
          .select("*")
          .eq("status", "pending")
          .gt("expires_at", nowIso)
          .eq("rider_phone_e164", userPhoneE164)
          .order("created_at", { ascending: false })
          .limit(INCOMING_LIST_LIMIT),
      );
    }

    const results = await Promise.all(queries);
    const merged = new Map<string, Record<string, unknown>>();
    for (const result of results) {
      for (const row of result.data ?? []) {
        const record = row as Record<string, unknown>;
        if (!rowMatchesIncomingRider(record, userId, userPhoneE164)) continue;
        merged.set(String(record.id), record);
      }
    }

    const sorted = [...merged.values()].sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at))
    ).slice(0, INCOMING_LIST_LIMIT);

    const requests = [];
    for (const row of sorted) {
      const fresh = await expirePickupLocationRequestIfNeeded(
        db,
        t.pickup_location_requests,
        row,
      );
      if (String(fresh.status) !== "pending") continue;
      const bookerName = await resolveBookerDisplayName(String(fresh.booker_user_id));
      requests.push(toIncomingPickupLocationRequestDto(fresh, bookerName));
    }

    return c.json({ requests });
  });

  app.get("/v1/pickup-location-requests/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.pickup_location_requests)
      .select("*")
      .eq("id", id)
      .eq("booker_user_id", gate.user!.id)
      .maybeSingle();

    if (!row) return c.json({ error: "not_found" }, 404);

    const fresh = await expirePickupLocationRequestIfNeeded(
      db,
      t.pickup_location_requests,
      row as Record<string, unknown>,
    );

    return c.json({ request: toPickupLocationRequestDto(fresh) });
  });

  app.delete("/v1/pickup-location-requests/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.pickup_location_requests)
      .select("*")
      .eq("id", id)
      .eq("booker_user_id", gate.user!.id)
      .maybeSingle();

    if (!row) return c.json({ error: "not_found" }, 404);
    if (String(row.status) !== "pending") {
      return c.json({ error: "not_cancellable", status: row.status }, 409);
    }

    const now = new Date().toISOString();
    await db.from(t.pickup_location_requests).update({
      status: "cancelled",
      updated_at: now,
    }).eq("id", id);

    await deps.audit(null, gate.user!.id, "pickup_location_request_cancelled", {
      request_id: id,
    });

    return c.json({ ok: true });
  });

  app.post("/v1/pickup-location-requests/:id/consume", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.pickup_location_requests)
      .select("*")
      .eq("id", id)
      .eq("booker_user_id", gate.user!.id)
      .maybeSingle();

    if (!row) return c.json({ error: "not_found" }, 404);
    if (String(row.status) === "consumed") {
      return c.json({ ok: true });
    }
    if (String(row.status) !== "shared") {
      return c.json({ error: "not_consumable", status: row.status }, 409);
    }

    const now = new Date().toISOString();
    await db.from(t.pickup_location_requests).update({
      status: "consumed",
      consumed_at: now,
      updated_at: now,
    }).eq("id", id);

    await deps.audit(null, gate.user!.id, "pickup_location_request_consumed", {
      request_id: id,
    });

    return c.json({ ok: true });
  });

  app.get("/v1/pickup-location-requests/token/:token", async (c) => {
    if (!isPickupLocationRequestEnabled()) {
      return c.json({ error: "pickup_location_request_disabled" }, 404);
    }

    const token = c.req.param("token");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.pickup_location_requests)
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!row) return c.json({ error: "not_found" }, 404);

    const fresh = await expirePickupLocationRequestIfNeeded(
      db,
      t.pickup_location_requests,
      row as Record<string, unknown>,
    );

    const status = String(fresh.status);
    if (TERMINAL_STATUSES.has(status) && status !== "shared") {
      return c.json({ error: "unavailable", status }, 410);
    }

    const bookerName = await resolveBookerDisplayName(String(fresh.booker_user_id));

    return c.json({
      preview: {
        token: String(fresh.token),
        rider_name: String(fresh.rider_name),
        booker_name: bookerName,
        status,
        expires_at: String(fresh.expires_at),
        phone_masked: maskPhone(String(fresh.rider_phone_e164)),
      },
    });
  });

  app.post("/v1/pickup-location-requests/:token/share", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const token = c.req.param("token");
    const body = await c.req.json().catch(() => ({}));
    const pickupLat = Number(body.pickup_lat);
    const pickupLng = Number(body.pickup_lng);
    const pickupAddress = typeof body.pickup_address === "string" ? body.pickup_address.trim() : "";

    if (Number.isNaN(pickupLat) || Number.isNaN(pickupLng) || !pickupAddress) {
      return c.json({ error: "invalid_location" }, 400);
    }

    const accuracyMeters = body.accuracy_meters != null ? Number(body.accuracy_meters) : null;

    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.pickup_location_requests)
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!row) return c.json({ error: "not_found" }, 404);

    let fresh = await expirePickupLocationRequestIfNeeded(
      db,
      t.pickup_location_requests,
      row as Record<string, unknown>,
    );

    if (String(fresh.status) === "shared") {
      const userPhone = gate.user!.phone ?? await resolveAuthUserPhone(gate.user!.id);
      if (userPhone && phonesMatch(userPhone, String(fresh.rider_phone_e164))) {
        return c.json({ request: toPickupLocationRequestDto(fresh) });
      }
    }

    if (String(fresh.status) !== "pending") {
      return c.json({ error: "unavailable", status: fresh.status }, 409);
    }

    const userPhone = gate.user!.phone ?? await resolveAuthUserPhone(gate.user!.id);
    if (!userPhone || !phonesMatch(userPhone, String(fresh.rider_phone_e164))) {
      return c.json({
        error: "phone_mismatch",
        message: "Sign in with the phone number this request was sent to.",
      }, 403);
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await db.from(t.pickup_location_requests).update({
      status: "shared",
      rider_user_id: gate.user!.id,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      pickup_address: pickupAddress,
      accuracy_meters: accuracyMeters,
      shared_at: now,
      updated_at: now,
    }).eq("id", fresh.id).eq("status", "pending").select("*").single();

    if (error || !updated) return c.json({ error: "share_failed" }, 409);

    await deps.audit(null, gate.user!.id, "pickup_location_request_shared", {
      request_id: updated.id,
      token,
    });

    return c.json({ request: toPickupLocationRequestDto(updated as Record<string, unknown>) });
  });

  app.post("/v1/pickup-location-requests/:token/decline", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const token = c.req.param("token");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.pickup_location_requests)
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!row) return c.json({ error: "not_found" }, 404);

    const fresh = await expirePickupLocationRequestIfNeeded(
      db,
      t.pickup_location_requests,
      row as Record<string, unknown>,
    );

    if (String(fresh.status) !== "pending") {
      return c.json({ error: "unavailable", status: fresh.status }, 409);
    }

    const userPhone = gate.user!.phone ?? await resolveAuthUserPhone(gate.user!.id);
    if (!userPhone || !phonesMatch(userPhone, String(fresh.rider_phone_e164))) {
      return c.json({
        error: "phone_mismatch",
        message: "Sign in with the phone number this request was sent to.",
      }, 403);
    }

    const now = new Date().toISOString();
    await db.from(t.pickup_location_requests).update({
      status: "declined",
      updated_at: now,
    }).eq("id", fresh.id).eq("status", "pending");

    await deps.audit(null, gate.user!.id, "pickup_location_request_declined", {
      request_id: fresh.id,
      token,
    });

    return c.json({ ok: true, status: "declined" });
  });
}
