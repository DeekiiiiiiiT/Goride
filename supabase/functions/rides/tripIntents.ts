import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import {
  generatePublicCode,
  generateToken,
  normalizeCustomRoamTagName,
  normalizePhoneE164,
  phonesMatch,
  validateCustomRoamTagName,
} from "./rideAccess.ts";
import {
  type RoamMode,
  sanitizeTripIntentForBooker,
} from "./tripIntentAccess.ts";
import { isTripIntentV2Enabled } from "./tripIntentFlags.ts";
import { linkBookingRequestToRide } from "./bookingRequests.ts";

export const TRIP_INTENT_TTL_HOURS = 1;

const ACTIVE_REQUESTER_STATUSES = ["draft", "published", "claimed", "booked", "pending"] as const;
const PUBLISHED_STATUSES = ["published", "claimed"] as const;

export type TripIntentDeps = {
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
  quoteIntent: (params: {
    pickup_lat: number;
    pickup_lng: number;
    dropoff_lat: number;
    dropoff_lng: number;
    vehicle_option: string;
    userId: string;
  }) => Promise<{ quote_token: string; fare_estimate_minor: string; currency: string }>;
  fulfillIntent: (params: {
    bookerUserId: string;
    intent: Record<string, unknown>;
    paymentMethod: string;
  }) => Promise<{ ride: Record<string, unknown> }>;
  cancelLinkedRide?: (
    rideId: string,
    requesterUserId: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
};

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) <= new Date();
}

async function expireIfNeeded(
  db: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (["expired", "consumed", "cancelled"].includes(String(row.status))) return row;
  if (!row.expires_at || !isExpired(String(row.expires_at))) return row;
  await db.from(table).update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", row.id);
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
    .in("status", [...ACTIVE_REQUESTER_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1);
  const row = rows?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const fresh = await expireIfNeeded(db, table, row);
  if (fresh.status === "expired") return null;
  return fresh;
}

async function findPublishedForRequester(
  db: SupabaseClient,
  table: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data: rows } = await db.from(table)
    .select("*")
    .eq("requester_user_id", userId)
    .in("status", [...PUBLISHED_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1);
  const row = rows?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const fresh = await expireIfNeeded(db, table, row);
  if (!PUBLISHED_STATUSES.includes(String(fresh.status) as typeof PUBLISHED_STATUSES[number])) {
    return null;
  }
  return fresh;
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
    requester_name: requesterName,
    user_id: requesterUserId ?? undefined,
  };
}

function validateShadowPublish(row: Record<string, unknown>): string | null {
  if (row.pickup_lat == null || row.dropoff_lat == null) return "shadow_route_required";
  if (!row.vehicle_option) return "shadow_vehicle_required";
  if (!row.quote_token) return "quote_required";
  return null;
}

function canBookerAccessIntent(
  row: Record<string, unknown>,
  bookerUserId: string,
  bookerPhone?: string | null,
): { ok: boolean; reason?: string } {
  if (row.requester_user_id === bookerUserId) {
    return { ok: false, reason: "cannot_book_self" };
  }
  const audience = String(row.audience ?? "any_booker");
  if (audience === "any_booker") return { ok: true };
  const targetUser = row.target_booker_user_id as string | null;
  if (targetUser && targetUser === bookerUserId) return { ok: true };
  const targetPhone = row.target_booker_phone_e164 as string | null;
  if (targetPhone && bookerPhone && phonesMatch(targetPhone, bookerPhone)) return { ok: true };
  return { ok: false, reason: "not_targeted" };
}

export async function listTripIntentsTargetingBooker(
  db: SupabaseClient,
  table: string,
  bookerUserId: string,
  bookerPhone?: string | null,
): Promise<Record<string, unknown>[]> {
  const openStatuses = ["published", "claimed"] as const;
  const queries = [
    db.from(table).select("*")
      .eq("target_booker_user_id", bookerUserId)
      .eq("audience", "targeted")
      .in("status", [...openStatuses]),
    db.from(table).select("*")
      .eq("claimed_by_user_id", bookerUserId)
      .in("status", ["claimed", "booked"]),
  ];

  const normalizedPhone = bookerPhone ? normalizePhoneE164(bookerPhone) : null;
  if (normalizedPhone) {
    queries.push(
      db.from(table).select("*")
        .eq("target_booker_phone_e164", normalizedPhone)
        .eq("audience", "targeted")
        .in("status", [...openStatuses]),
    );
  }

  const results = await Promise.all(queries);
  const merged = new Map<string, Record<string, unknown>>();

  for (const { data } of results) {
    for (const row of data ?? []) {
      const record = row as Record<string, unknown>;
      if (String(record.requester_user_id) === bookerUserId) continue;
      const fresh = await expireIfNeeded(db, table, record);
      const status = String(fresh.status);
      const claimedByMe = String(fresh.claimed_by_user_id) === bookerUserId;

      if (status === "booked" && claimedByMe) {
        merged.set(String(fresh.id), fresh);
        continue;
      }
      if (status === "claimed" && claimedByMe) {
        merged.set(String(fresh.id), fresh);
        continue;
      }
      if (status === "published" && openStatuses.includes(status as typeof openStatuses[number])) {
        if (String(fresh.audience) === "targeted") {
          const access = canBookerAccessIntent(fresh, bookerUserId, bookerPhone);
          if (!access.ok) continue;
        }
        merged.set(String(fresh.id), fresh);
      }
    }
  }

  return [...merged.values()].sort(
    (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
  );
}

export async function loadTripIntentBookerViewById(
  deps: TripIntentDeps,
  intentId: string,
  bookerUserId: string,
  bookerPhone?: string | null,
): Promise<Record<string, unknown> | null> {
  const { db, tables: t } = await deps.getContactsDb();
  const { data: row } = await db.from(t.booking_requests).select("*").eq("id", intentId).maybeSingle();
  if (!row) return null;
  const fresh = await expireIfNeeded(db, t.booking_requests, row as Record<string, unknown>);
  const status = String(fresh.status);
  const claimedByMe = String(fresh.claimed_by_user_id) === bookerUserId;
  if (status === "booked") {
    if (!claimedByMe) return null;
  } else if (!["published", "claimed"].includes(status)) {
    return null;
  } else {
    const access = canBookerAccessIntent(fresh, bookerUserId, bookerPhone);
    if (!access.ok) return null;
  }
  const requester = await loadRequesterPublicProfile(
    db,
    t.roam_passenger_tags,
    String(fresh.requester_user_id),
    String(fresh.requester_name),
  );
  return buildTripIntentBookerView(fresh, requester, bookerUserId, bookerPhone);
}

export function mapTripIntentHubItem(
  row: Record<string, unknown>,
  role: "requester" | "target_booker",
): Record<string, unknown> {
  return {
    kind: "trip_intent",
    intent_id: String(row.id),
    status: String(row.status),
    roam_mode: String(row.roam_mode ?? "open_roam"),
    pickup_address: typeof row.pickup_address === "string" ? row.pickup_address : null,
    dropoff_address: typeof row.dropoff_address === "string" ? row.dropoff_address : null,
    fare_estimate_minor: row.fare_estimate_minor != null ? String(row.fare_estimate_minor) : null,
    currency: typeof row.currency === "string" ? row.currency : null,
    created_at: String(row.created_at),
    requester_name: typeof row.requester_name === "string" ? row.requester_name : null,
    intent_role: role,
    ride_request_id: row.ride_request_id != null ? String(row.ride_request_id) : null,
    linked_ride_status: row.linked_ride_status != null ? String(row.linked_ride_status) : null,
    can_cancel: row.can_cancel === true || role === "requester",
  };
}

function resolveBookerPhone(user: {
  phone?: string | null;
  user_metadata?: Record<string, unknown>;
}): string | null {
  if (typeof user.phone === "string" && user.phone.trim()) return user.phone;
  const metaPhone = user.user_metadata?.phone;
  if (typeof metaPhone === "string" && metaPhone.trim()) return metaPhone;
  return null;
}

export async function buildTripIntentBookerView(
  row: Record<string, unknown>,
  requester: Record<string, unknown>,
  bookerUserId: string,
  bookerPhone?: string | null,
): Promise<Record<string, unknown>> {
  const roamMode = String(row.roam_mode ?? "open_roam") as RoamMode;
  const access = canBookerAccessIntent(row, bookerUserId, bookerPhone);
  const base = sanitizeTripIntentForBooker(row, roamMode);
  return {
    ...base,
    requester,
    can_fulfill: access.ok && ["published", "claimed"].includes(String(row.status)),
    block_reason: access.ok ? null : access.reason ?? "unavailable",
  };
}

export async function loadActiveTripIntentSummary(
  db: SupabaseClient,
  table: string,
  requesterUserId: string,
): Promise<Record<string, unknown> | null> {
  const row = await findPublishedForRequester(db, table, requesterUserId);
  if (!row) return null;
  return {
    roam_mode: String(row.roam_mode ?? "open_roam"),
    fare_estimate_minor: row.fare_estimate_minor != null ? String(row.fare_estimate_minor) : null,
    status: String(row.status),
  };
}

export async function loadPublishedIntentBookerView(
  deps: TripIntentDeps,
  requesterUserId: string,
  bookerUserId: string,
  bookerPhone?: string | null,
): Promise<Record<string, unknown> | null> {
  const { db, tables: t } = await deps.getContactsDb();
  const row = await findPublishedForRequester(db, t.booking_requests, requesterUserId);
  if (!row) return null;
  const requester = await loadRequesterPublicProfile(
    db,
    t.roam_passenger_tags,
    requesterUserId,
    String(row.requester_name),
  );
  return buildTripIntentBookerView(row, requester, bookerUserId, bookerPhone);
}

export function registerTripIntentRoutes(app: Hono, deps: TripIntentDeps) {
  const requirePassenger = async (c: { req: { header: (n: string) => string | undefined }; json: (b: unknown, s: number) => Response }) => {
    if (!isTripIntentV2Enabled()) {
      return { response: c.json({ error: "trip_intent_v2_disabled" }, 404) };
    }
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return { response: c.json({ error: auth.error }, auth.status) };
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
      return { response: jsonEdgeForbidden(c as never, "forbidden_role") };
    }
    return { user: auth.user, response: null };
  };

  app.post("/v1/trip-intents", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const body = await c.req.json().catch(() => ({}));
    const requesterName = typeof body.requester_name === "string" ? body.requester_name.trim() : "";
    const requesterPhone = typeof body.requester_phone === "string" ? body.requester_phone.trim() : "";
    if (!requesterName || !requesterPhone) return c.json({ error: "invalid_body" }, 400);

    const { db, tables: t } = await deps.getContactsDb();
    const existing = await findActiveForRequester(db, t.booking_requests, gate.user!.id);
    if (existing) {
      if (String(existing.status) === "pending") {
        const { data: upgraded, error: upgradeErr } = await db.from(t.booking_requests).update({
          status: "draft",
          roam_mode: body.roam_mode === "shadow_roam" ? "shadow_roam" : "open_roam",
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id).select("*").single();
        if (upgradeErr || !upgraded) {
          console.error("[trip_intents] pending_upgrade_failed", upgradeErr);
          return c.json({
            error: "insert_failed",
            message: upgradeErr?.message ?? "Could not upgrade legacy booking request",
            hint: "Run supabase db push to apply trip_intents migration",
          }, 500);
        }
        return c.json({ trip_intent: upgraded, reused: true });
      }
      if (String(existing.status) === "published") {
        const { data: upgraded, error: upgradeErr } = await db.from(t.booking_requests).update({
          status: "draft",
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id).select("*").single();
        if (!upgradeErr && upgraded) {
          return c.json({ trip_intent: upgraded, reused: true });
        }
      }
      return c.json({ trip_intent: existing, reused: true });
    }

    const roamMode = body.roam_mode === "shadow_roam" ? "shadow_roam" : "open_roam";
    const expiresAt = new Date(Date.now() + TRIP_INTENT_TTL_HOURS * 3600_000).toISOString();

    const row = {
      token: generateToken(16),
      public_code: generatePublicCode(),
      requester_user_id: gate.user!.id,
      requester_name: requesterName,
      requester_phone: normalizePhoneE164(requesterPhone),
      roam_mode: roamMode,
      audience: body.audience === "targeted" ? "targeted" : "any_booker",
      target_booker_user_id: typeof body.target_booker_user_id === "string" ? body.target_booker_user_id : null,
      target_booker_phone_e164: typeof body.target_booker_phone_e164 === "string"
        ? normalizePhoneE164(body.target_booker_phone_e164)
        : null,
      pickup_lat: body.pickup_lat != null ? Number(body.pickup_lat) : null,
      pickup_lng: body.pickup_lng != null ? Number(body.pickup_lng) : null,
      pickup_address: typeof body.pickup_address === "string" ? body.pickup_address : null,
      dropoff_lat: body.dropoff_lat != null ? Number(body.dropoff_lat) : null,
      dropoff_lng: body.dropoff_lng != null ? Number(body.dropoff_lng) : null,
      dropoff_address: typeof body.dropoff_address === "string" ? body.dropoff_address : null,
      vehicle_option: typeof body.vehicle_option === "string" ? body.vehicle_option : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      status: "draft",
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await db.from(t.booking_requests).insert(row).select("*").single();
    if (error || !data) {
      console.error("[trip_intents] insert_failed", error);
      const hint = error?.code === "23514"
        ? "Database migration required — run: npx supabase db push"
        : error?.code === "42703"
          ? "booking_requests view out of date — run migration 20260615120000_trip_intents_view_refresh.sql"
          : undefined;
      return c.json({
        error: "insert_failed",
        message: error?.message ?? undefined,
        code: error?.code ?? undefined,
        hint,
      }, 500);
    }
    await deps.audit(null, gate.user!.id, "trip_intent_created", { trip_intent_id: data.id });
    return c.json({ trip_intent: data });
  });

  app.patch("/v1/trip-intents/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.booking_requests).select("*").eq("id", id)
      .eq("requester_user_id", gate.user!.id).maybeSingle();
    if (!row || !["draft", "published"].includes(String(row.status))) {
      return c.json({ error: "not_editable" }, 404);
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.roam_mode === "shadow_roam" || body.roam_mode === "open_roam") patch.roam_mode = body.roam_mode;
    if (body.audience === "targeted" || body.audience === "any_booker") patch.audience = body.audience;
    if (body.target_booker_user_id !== undefined) patch.target_booker_user_id = body.target_booker_user_id;
    if (body.target_booker_phone_e164 !== undefined) {
      patch.target_booker_phone_e164 = body.target_booker_phone_e164
        ? normalizePhoneE164(String(body.target_booker_phone_e164))
        : null;
    }
    for (const key of ["pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng"] as const) {
      if (body[key] != null) patch[key] = Number(body[key]);
    }
    for (const key of ["pickup_address", "dropoff_address", "vehicle_option", "notes"] as const) {
      if (typeof body[key] === "string") patch[key] = body[key];
    }

    const { data, error } = await db.from(t.booking_requests).update(patch).eq("id", id).select("*").single();
    if (error || !data) return c.json({ error: "update_failed" }, 500);
    return c.json({ trip_intent: data });
  });

  app.post("/v1/trip-intents/:id/quote", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.booking_requests).select("*").eq("id", id)
      .eq("requester_user_id", gate.user!.id).maybeSingle();
    if (!row) return c.json({ error: "not_found" }, 404);

    const pickup_lat = Number(row.pickup_lat);
    const pickup_lng = Number(row.pickup_lng);
    const dropoff_lat = Number(row.dropoff_lat);
    const dropoff_lng = Number(row.dropoff_lng);
    const vehicle = String(row.vehicle_option ?? "uberx");
    if ([pickup_lat, pickup_lng, dropoff_lat, dropoff_lng].some((x) => Number.isNaN(x))) {
      return c.json({ error: "route_required_for_quote" }, 400);
    }

    const quote = await deps.quoteIntent({
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
      vehicle_option: vehicle,
      userId: gate.user!.id,
    });

    await db.from(t.booking_requests).update({
      quote_token: quote.quote_token,
      fare_estimate_minor: quote.fare_estimate_minor,
      currency: quote.currency,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    return c.json(quote);
  });

  app.post("/v1/trip-intents/:id/publish", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.booking_requests).select("*").eq("id", id)
      .eq("requester_user_id", gate.user!.id).maybeSingle();
    if (!row || String(row.status) !== "draft") return c.json({ error: "not_draft" }, 409);

    if (String(row.roam_mode) === "shadow_roam") {
      const err = validateShadowPublish(row as Record<string, unknown>);
      if (err) return c.json({ error: err }, 400);
    }

    const now = new Date().toISOString();
    const { data, error } = await db.from(t.booking_requests).update({
      status: "published",
      published_at: now,
      expires_at: new Date(Date.now() + TRIP_INTENT_TTL_HOURS * 3600_000).toISOString(),
      updated_at: now,
    }).eq("id", id).select("*").single();
    if (error || !data) return c.json({ error: "publish_failed" }, 500);
    await deps.audit(null, gate.user!.id, "trip_intent_published", { trip_intent_id: id });
    return c.json({ trip_intent: data });
  });

  app.get("/v1/trip-intents/me/active", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    const active = await findActiveForRequester(db, t.booking_requests, gate.user!.id);
    return c.json({ trip_intent: active });
  });

  app.get("/v1/trip-intents/me/targeting-me", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    const bookerPhone = resolveBookerPhone(gate.user!);
    const rows = await listTripIntentsTargetingBooker(
      db,
      t.booking_requests,
      gate.user!.id,
      bookerPhone,
    );
    return c.json({
      trip_intents: rows.map((row) => mapTripIntentHubItem(row, "target_booker")),
    });
  });

  app.get("/v1/trip-intents/:id/booker-view", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const id = c.req.param("id");
    const bookerPhone = resolveBookerPhone(gate.user!);
    const intent = await loadTripIntentBookerViewById(deps, id, gate.user!.id, bookerPhone);
    if (!intent) return c.json({ error: "not_found" }, 404);
    return c.json({ trip_intent: intent });
  });

  app.delete("/v1/trip-intents/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.booking_requests).select("*").eq("id", id)
      .eq("requester_user_id", gate.user!.id).maybeSingle();
    if (!row) return c.json({ error: "not_found" }, 404);

    const status = String(row.status);
    const withdrawable = ["draft", "published", "claimed", "booked"];
    if (!withdrawable.includes(status)) {
      return c.json({ error: "not_cancellable", status }, 409);
    }

    const now = new Date().toISOString();
    await db.from(t.booking_requests).update({
      status: "cancelled",
      updated_at: now,
    }).eq("id", id);

    const rideId = typeof row.ride_request_id === "string" ? row.ride_request_id : null;
    if (rideId && deps.cancelLinkedRide) {
      const result = await deps.cancelLinkedRide(rideId, gate.user!.id);
      if (!result.ok && result.reason === "ride_not_cancellable") {
        return c.json({
          error: "ride_not_cancellable",
          message: "Your driver is already on the way — contact support if you need help.",
        }, 409);
      }
    }

    await deps.audit(rideId, gate.user!.id, "trip_intent_cancelled_by_requester", {
      trip_intent_id: id,
      prior_status: status,
    });
    return c.json({ ok: true });
  });

  app.post("/v1/trip-intents/:id/claim", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: br } = await db.from(t.booking_requests).select("*").eq("id", id).maybeSingle();
    if (!br) return c.json({ error: "not_found" }, 404);
    const row = await expireIfNeeded(db, t.booking_requests, br as Record<string, unknown>);
    if (String(row.status) !== "published") return c.json({ error: "not_published", status: row.status }, 409);

    const access = canBookerAccessIntent(row, gate.user!.id);
    if (!access.ok) return c.json({ error: access.reason ?? "forbidden" }, 403);

    const now = new Date().toISOString();
    const { data: updated, error } = await db.from(t.booking_requests).update({
      status: "claimed",
      claimed_by_user_id: gate.user!.id,
      updated_at: now,
    }).eq("id", id).eq("status", "published").select("*").single();
    if (error || !updated) return c.json({ error: "claim_failed" }, 409);

    const requester = await loadRequesterPublicProfile(
      db,
      t.roam_passenger_tags,
      row.requester_user_id as string,
      String(row.requester_name),
    );
    const intent = await buildTripIntentBookerView(updated as Record<string, unknown>, requester, gate.user!.id);
    return c.json({ trip_intent: intent });
  });

  app.post("/v1/trip-intents/:id/reject", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const id = c.req.param("id");
    const bookerPhone = resolveBookerPhone(gate.user!);
    const { db, tables: t } = await deps.getContactsDb();
    const { data: br } = await db.from(t.booking_requests).select("*").eq("id", id).maybeSingle();
    if (!br) return c.json({ error: "not_found" }, 404);

    const row = await expireIfNeeded(db, t.booking_requests, br as Record<string, unknown>);
    const status = String(row.status);
    const bookerId = gate.user!.id;
    const claimedByMe = String(row.claimed_by_user_id) === bookerId;

    if (status === "booked") {
      return c.json({ error: "not_rejectable", status }, 409);
    }
    if (status === "claimed" && !claimedByMe) {
      return c.json({ error: "not_claimed_by_you" }, 403);
    }
    if (!["published", "claimed"].includes(status)) {
      return c.json({ error: "not_rejectable", status }, 409);
    }

    const access = canBookerAccessIntent(row, bookerId, bookerPhone);
    if (!access.ok) return c.json({ error: access.reason ?? "forbidden" }, 403);

    const now = new Date().toISOString();
    const audience = String(row.audience ?? "any_booker");

    if (status === "claimed" && claimedByMe && audience === "any_booker") {
      await db.from(t.booking_requests).update({
        status: "published",
        claimed_by_user_id: null,
        updated_at: now,
      }).eq("id", id);
      await deps.audit(null, bookerId, "trip_intent_rejected_by_booker", {
        trip_intent_id: id,
        audience,
        prior_status: status,
        outcome: "released",
      });
      return c.json({ ok: true, status: "published" });
    }

    await db.from(t.booking_requests).update({
      status: "cancelled",
      claimed_by_user_id: null,
      updated_at: now,
    }).eq("id", id);
    await deps.audit(null, bookerId, "trip_intent_rejected_by_booker", {
      trip_intent_id: id,
      audience,
      prior_status: status,
      outcome: "cancelled",
    });
    return c.json({ ok: true, status: "cancelled" });
  });

  app.post("/v1/trip-intents/:id/fulfill", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const paymentMethod = body.payment_method === "card" ? "card" : null;
    if (paymentMethod !== "card") return c.json({ error: "digital_payment_required" }, 400);

    const { db, tables: t } = await deps.getContactsDb();
    let { data: br } = await db.from(t.booking_requests).select("*").eq("id", id).maybeSingle();
    if (!br) return c.json({ error: "not_found" }, 404);
    let row = await expireIfNeeded(db, t.booking_requests, br as Record<string, unknown>);

    if (String(row.status) === "published") {
      const access = canBookerAccessIntent(row, gate.user!.id);
      if (!access.ok) return c.json({ error: access.reason ?? "forbidden" }, 403);
      const now = new Date().toISOString();
      const { data: claimed } = await db.from(t.booking_requests).update({
        status: "claimed",
        claimed_by_user_id: gate.user!.id,
        updated_at: now,
      }).eq("id", id).eq("status", "published").select("*").single();
      if (!claimed) return c.json({ error: "claim_failed" }, 409);
      row = claimed as Record<string, unknown>;
    }

    if (String(row.status) !== "claimed" || row.claimed_by_user_id !== gate.user!.id) {
      return c.json({ error: "not_claimed_by_you" }, 403);
    }
    if (!row.quote_token) return c.json({ error: "quote_required" }, 400);

    const { ride } = await deps.fulfillIntent({
      bookerUserId: gate.user!.id,
      intent: row,
      paymentMethod,
    });

    await db.from(t.booking_requests).update({
      status: "booked",
      ride_request_id: ride.id,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    await linkBookingRequestToRide(deps.getContactsDb, id, String(ride.id));

    const roamMode = String(row.roam_mode ?? "open_roam") as RoamMode;
    return c.json({
      ride: { id: ride.id, status: ride.status, roam_mode: roamMode },
      roam_mode: roamMode,
    });
  });

  app.get("/v1/roam-tag/:name/intent", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const normalized = normalizeCustomRoamTagName(c.req.param("name"));
    if (validateCustomRoamTagName(normalized)) {
      return c.json({ error: "invalid_tag" }, 400);
    }
    const { db, tables: t } = await deps.getContactsDb();
    const { data: tagRow } = await db.from(t.roam_passenger_tags)
      .select("user_id, custom_tag_name")
      .eq("custom_tag_name", normalized)
      .maybeSingle();
    if (!tagRow) return c.json({ error: "not_found" }, 404);
    if (tagRow.user_id === gate.user!.id) {
      return c.json({ error: "cannot_book_self" }, 400);
    }
    const intent = await loadPublishedIntentBookerView(
      deps,
      String(tagRow.user_id),
      gate.user!.id,
    );
    return c.json({
      tag: { custom_tag_name: tagRow.custom_tag_name, display_name: intent?.requester?.requester_name ?? null },
      intent,
    });
  });

  app.get("/v1/contacts/:id/intent", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const contactId = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: contact } = await db.from(t.rider_contacts).select("linked_user_id")
      .eq("id", contactId).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!contact?.linked_user_id) return c.json({ intent: null });
    const intent = await loadPublishedIntentBookerView(
      deps,
      String(contact.linked_user_id),
      gate.user!.id,
    );
    return c.json({ intent });
  });
}
