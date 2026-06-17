import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deniesPassengerSurface, jsonEdgeForbidden } from "../_shared/authEdge.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import { resolveRoamUserByPhone } from "./resolveRoamUserByPhone.ts";
import {
  generateToken,
  normalizePhoneE164,
  passengerAuthorizeUrl,
  phonesMatch,
} from "./rideAccess.ts";
import { isRoamConnectionsEnabled } from "./roamConnectionFlags.ts";
import { isBlockedEitherDirection } from "./roamConnectionHelpers.ts";

type AuthDeps = {
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
  rateLimit?: (key: string, max: number, windowMs: number) => boolean;
};

export const PASSENGER_AUTHORIZATION_TTL_MS = 60 * 60_000;

function maskPhone(e164: string): string {
  return e164.replace(/\d(?=\d{4})/g, "*");
}

function authExpiresAt(fromMs: number = Date.now()): string {
  return new Date(fromMs + PASSENGER_AUTHORIZATION_TTL_MS).toISOString();
}

async function expireStaleAuthorizationsForBooker(
  db: Awaited<ReturnType<AuthDeps["getContactsDb"]>>["db"],
  table: string,
  bookerUserId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.from(table).update({ status: "expired", updated_at: now })
    .eq("booker_user_id", bookerUserId)
    .eq("status", "pending")
    .lt("expires_at", now);
}

function toAuthDto(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    token: String(row.token),
    url: passengerAuthorizeUrl(String(row.token)),
    status: String(row.status),
    recipient_name: String(row.recipient_name),
    phone_e164: String(row.phone_e164),
    passenger_user_id: row.passenger_user_id ? String(row.passenger_user_id) : null,
    expires_at: String(row.expires_at),
    claimed_at: row.claimed_at ? String(row.claimed_at) : null,
  };
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

export async function lookupPassengerByPhone(phoneE164: string): Promise<{
  found: boolean;
  profile?: Record<string, unknown>;
}> {
  const normalized = normalizePhoneE164(phoneE164);
  const resolved = await resolveRoamUserByPhone(normalized);
  if (!resolved) {
    return { found: false };
  }

  let avatarUrl: string | null = null;

  try {
    const svc = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: authData } = await svc.auth.admin.getUserById(resolved.user_id);
    const meta = authData.user?.user_metadata as Record<string, unknown> | undefined;
    avatarUrl =
      (typeof meta?.avatar_url === "string" && meta.avatar_url.trim()) ||
      (typeof meta?.picture === "string" && meta.picture.trim()) ||
      null;
  } catch {
    /* optional */
  }

  return {
    found: true,
    profile: {
      user_id: resolved.user_id,
      display_name: resolved.display_name,
      custom_tag_name: resolved.custom_tag_name,
      avatar_url: avatarUrl,
      phone_masked: maskPhone(normalized),
    },
  };
}

export async function consumePassengerAuthorization(
  authId: string,
  bookerUserId: string,
  passengerUserId: string,
  rideRequestId: string,
): Promise<boolean> {
  const { getContactsDb } = await import("../_shared/ridesContactsDb.ts");
  const { db, tables: t } = await getContactsDb();
  const { data: row } = await db.from(t.passenger_authorizations)
    .select("*")
    .eq("id", authId)
    .eq("booker_user_id", bookerUserId)
    .maybeSingle();
  if (!row) return false;
  if (row.status !== "claimed") return false;
  if (String(row.passenger_user_id) !== passengerUserId) return false;
  if (new Date(String(row.expires_at)) <= new Date()) return false;

  const now = new Date().toISOString();
  const { error } = await db.from(t.passenger_authorizations).update({
    status: "consumed",
    consumed_at: now,
    ride_request_id: rideRequestId,
    updated_at: now,
  }).eq("id", authId);
  return !error;
}

export function registerPassengerAuthorizationRoutes(app: Hono, deps: AuthDeps) {
  app.get("/v1/passengers/lookup", async (c: Context) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deniesPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const rawPhone = c.req.query("phone_e164")?.trim();
    if (!rawPhone) return c.json({ error: "phone_required" }, 400);

    if (deps.rateLimit) {
      const limited = !deps.rateLimit(`${auth.user.id}:passenger_lookup`, 30, 60_000);
      if (limited) return c.json({ error: "rate_limited" }, 429);
    }

    try {
      const result = await lookupPassengerByPhone(rawPhone);
      if (isRoamConnectionsEnabled() && result.found && result.profile?.user_id) {
        const { db, tables: t } = await deps.getContactsDb();
        if (await isBlockedEitherDirection(db, t, auth.user.id, String(result.profile.user_id))) {
          return c.json({ found: false });
        }
      }
      return c.json(result);
    } catch {
      return c.json({ error: "lookup_failed" }, 500);
    }
  });

  app.post("/v1/passenger-authorizations", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deniesPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const body = await c.req.json().catch(() => ({}));
    const recipientName = typeof body.recipient_name === "string" ? body.recipient_name.trim() : "";
    const rawPhone = typeof body.phone_e164 === "string" ? body.phone_e164.trim() : "";
    if (!recipientName || !rawPhone) {
      return c.json({ error: "invalid_recipient" }, 400);
    }

    let phoneE164: string;
    try {
      phoneE164 = normalizePhoneE164(rawPhone);
    } catch {
      return c.json({ error: "invalid_phone" }, 400);
    }

    const draftTrip = body.draft_trip_json && typeof body.draft_trip_json === "object"
      ? body.draft_trip_json
      : null;

    if (isRoamConnectionsEnabled()) {
      const resolved = await resolveRoamUserByPhone(phoneE164);
      if (resolved) {
        const { db, tables: t } = await deps.getContactsDb();
        if (await isBlockedEitherDirection(db, t, auth.user.id, resolved.user_id)) {
          return c.json({ error: "blocked", message: "You cannot request authorization from this user." }, 403);
        }
      }
    }

    const { db, tables: t } = await deps.getContactsDb();
    const token = generateToken(16);
    const expiresAt = authExpiresAt();

    const { data: row, error } = await db.from(t.passenger_authorizations).insert({
      token,
      booker_user_id: auth.user.id,
      recipient_name: recipientName,
      phone_e164: phoneE164,
      status: "pending",
      draft_trip_json: draftTrip,
      expires_at: expiresAt,
    }).select("*").single();

    if (error || !row) return c.json({ error: "insert_failed" }, 500);

    await deps.audit(null, auth.user.id, "passenger_authorization_created", {
      authorization_id: row.id,
      token,
    });

    return c.json({ authorization: toAuthDto(row as Record<string, unknown>) });
  });

  app.get("/v1/passenger-authorizations/mine", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deniesPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    if (deps.rateLimit) {
      const limited = !deps.rateLimit(`${auth.user.id}:auth_list`, 60, 60_000);
      if (limited) return c.json({ error: "rate_limited" }, 429);
    }

    const statusFilter = c.req.query("status")?.trim() || "active";
    const { db, tables: t } = await deps.getContactsDb();
    await expireStaleAuthorizationsForBooker(db, t.passenger_authorizations, auth.user.id);
    let query = db.from(t.passenger_authorizations)
      .select("*")
      .eq("booker_user_id", auth.user.id)
      .order("created_at", { ascending: false });

    if (statusFilter === "pending") {
      query = query.eq("status", "pending");
    } else if (statusFilter === "claimed") {
      query = query.eq("status", "claimed");
    } else if (statusFilter === "all") {
      // no extra filter
    } else {
      query = query.in("status", ["pending", "claimed"]);
    }

    const { data: rows } = await query;
    const now = Date.now();
    const authorizations = (rows ?? [])
      .filter((row) => {
        if (row.status === "consumed" || row.status === "cancelled" || row.status === "expired") {
          return statusFilter === "all";
        }
        if (row.status === "pending" && new Date(String(row.expires_at)).getTime() <= now) {
          return statusFilter === "all";
        }
        return true;
      })
      .map((row) => toAuthDto(row as Record<string, unknown>));

    return c.json({ authorizations });
  });

  app.post("/v1/passenger-authorizations/id/:id/cancel", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deniesPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.passenger_authorizations)
      .select("*")
      .eq("id", id)
      .eq("booker_user_id", auth.user.id)
      .maybeSingle();

    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.status !== "pending" && row.status !== "claimed") {
      return c.json({ error: "not_cancellable" }, 409);
    }

    const now = new Date().toISOString();
    const { error } = await db.from(t.passenger_authorizations).update({
      status: "cancelled",
      updated_at: now,
    }).eq("id", id).in("status", ["pending", "claimed"]);

    if (error) return c.json({ error: "cancel_failed" }, 500);

    await deps.audit(null, auth.user.id, "passenger_authorization_cancelled", {
      authorization_id: id,
    });

    return c.json({ ok: true });
  });

  app.post("/v1/passenger-authorizations/id/:id/update-phone", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deniesPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const rawPhone = typeof body.phone_e164 === "string" ? body.phone_e164.trim() : "";
    if (!rawPhone) return c.json({ error: "invalid_phone" }, 400);

    let phoneE164: string;
    try {
      phoneE164 = normalizePhoneE164(rawPhone);
    } catch {
      return c.json({ error: "invalid_phone" }, 400);
    }

    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.passenger_authorizations)
      .select("*")
      .eq("id", id)
      .eq("booker_user_id", auth.user.id)
      .maybeSingle();

    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.status !== "pending") {
      return c.json({ error: "not_editable", message: "Only pending authorizations can be updated." }, 409);
    }
    if (new Date(String(row.expires_at)) <= new Date()) {
      return c.json({ error: "expired" }, 410);
    }
    if (phonesMatch(phoneE164, String(row.phone_e164))) {
      return c.json({ error: "phone_unchanged" }, 400);
    }

    if (isRoamConnectionsEnabled()) {
      const resolved = await resolveRoamUserByPhone(phoneE164);
      if (resolved) {
        if (await isBlockedEitherDirection(db, t, auth.user.id, resolved.user_id)) {
          return c.json({ error: "blocked" }, 403);
        }
      }
    }

    const now = new Date().toISOString();
    const { error: cancelErr } = await db.from(t.passenger_authorizations).update({
      status: "cancelled",
      updated_at: now,
    }).eq("id", id).eq("status", "pending");

    if (cancelErr) return c.json({ error: "cancel_failed" }, 500);

    const token = generateToken(16);
    const { data: created, error: insertErr } = await db.from(t.passenger_authorizations).insert({
      token,
      booker_user_id: auth.user.id,
      recipient_name: row.recipient_name,
      phone_e164: phoneE164,
      status: "pending",
      draft_trip_json: row.draft_trip_json,
      expires_at: authExpiresAt(),
    }).select("*").single();

    if (insertErr || !created) return c.json({ error: "insert_failed" }, 500);

    await deps.audit(null, auth.user.id, "passenger_authorization_phone_updated", {
      cancelled_authorization_id: id,
      authorization_id: created.id,
      token,
    });

    return c.json({
      authorization: toAuthDto(created as Record<string, unknown>),
      cancelled_authorization_id: id,
    });
  });

  app.get("/v1/passenger-authorizations/:token", async (c) => {
    const token = c.req.param("token");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.passenger_authorizations)
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.status === "consumed" || row.status === "cancelled") {
      return c.json({ error: "unavailable" }, 410);
    }
    if (new Date(String(row.expires_at)) <= new Date() && row.status === "pending") {
      const now = new Date().toISOString();
      await db.from(t.passenger_authorizations).update({
        status: "expired",
        updated_at: now,
      }).eq("id", row.id).eq("status", "pending");
      return c.json({ error: "expired" }, 410);
    }

    return c.json({
      authorization: {
        token: row.token,
        recipient_name: row.recipient_name,
        phone_masked: maskPhone(String(row.phone_e164)),
        status: row.status,
        expires_at: row.expires_at,
        booker_name: null,
      },
    });
  });

  app.get("/v1/passenger-authorizations/id/:id", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.passenger_authorizations)
      .select("*")
      .eq("id", id)
      .eq("booker_user_id", auth.user.id)
      .maybeSingle();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ authorization: toAuthDto(row as Record<string, unknown>) });
  });

  app.post("/v1/passenger-authorizations/:token/claim", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deniesPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const token = c.req.param("token");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.passenger_authorizations)
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.status === "claimed" && row.passenger_user_id === auth.user.id) {
      return c.json({
        authorization_id: row.id,
        passenger_user_id: auth.user.id,
      });
    }
    if (row.status !== "pending") return c.json({ error: "unavailable" }, 409);
    if (new Date(String(row.expires_at)) <= new Date()) {
      return c.json({ error: "expired" }, 410);
    }

    const userPhone = (auth.user as { phone?: string }).phone ?? await resolveAuthUserPhone(auth.user.id);
    if (!userPhone || !phonesMatch(userPhone, String(row.phone_e164))) {
      return c.json({
        error: "phone_mismatch",
        message: "Sign in with the phone number this authorization was sent to.",
      }, 403);
    }

    const now = new Date().toISOString();
    const { error } = await db.from(t.passenger_authorizations).update({
      status: "claimed",
      passenger_user_id: auth.user.id,
      claimed_at: now,
      updated_at: now,
    }).eq("id", row.id).eq("status", "pending");

    if (error) return c.json({ error: "claim_failed" }, 500);

    await deps.audit(null, auth.user.id, "passenger_authorization_claimed", {
      authorization_id: row.id,
      token,
    });

    return c.json({
      authorization_id: row.id,
      passenger_user_id: auth.user.id,
    });
  });
}
