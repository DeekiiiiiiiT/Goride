import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";
import { getRidesAdminDb } from "../_shared/ridesAdminDb.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import {
  isPassengerVerified,
  REQUIRE_PHONE_SMS_VERIFICATION,
  resolvePassengerPhone,
} from "./passengerProfile.ts";
import {
  generateToken,
  normalizePhoneE164,
  passengerAuthorizeUrl,
  phonesMatch,
} from "./rideAccess.ts";

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

const AUTH_TTL_HOURS = 48;

function maskPhone(e164: string): string {
  return e164.replace(/\d(?=\d{4})/g, "*");
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
  const { db, tables } = await getRidesAdminDb();
  const { data: profiles } = await db.from(tables.rider_profiles)
    .select("user_id, display_name, phone, phone_verified_at")
    .not("phone", "is", null);

  let matchedUserId: string | null = null;
  let matchedProfile: Record<string, unknown> | null = null;

  for (const row of profiles ?? []) {
    const profilePhone = row.phone ? normalizePhoneE164(String(row.phone)) : null;
    if (profilePhone && phonesMatch(profilePhone, normalized)) {
      matchedUserId = String(row.user_id);
      matchedProfile = row as Record<string, unknown>;
      break;
    }
  }

  if (!matchedUserId) {
    return { found: false };
  }

  const phone = await resolvePassengerPhone(db, tables.rider_profiles, matchedUserId);
  const verified = isPassengerVerified(
    matchedProfile as { user_id: string; display_name: string | null; phone: string | null; phone_verified_at?: string | null },
    phone,
    REQUIRE_PHONE_SMS_VERIFICATION,
  );
  if (!verified) {
    return { found: false };
  }

  let displayName = (matchedProfile?.display_name as string | null) ?? null;
  let avatarUrl: string | null = null;
  let customTagName: string | null = null;

  try {
    const { getContactsDb } = await import("../_shared/ridesContactsDb.ts");
    const { db: contactsDb, tables: ct } = await getContactsDb();
    const { data: tagRow } = await contactsDb.from(ct.roam_passenger_tags)
      .select("custom_tag_name")
      .eq("user_id", matchedUserId)
      .maybeSingle();
    customTagName = (tagRow?.custom_tag_name as string | null) ?? null;
  } catch {
    /* optional */
  }

  try {
    const svc = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: authData } = await svc.auth.admin.getUserById(matchedUserId);
    const meta = authData.user?.user_metadata as Record<string, unknown> | undefined;
    avatarUrl =
      (typeof meta?.avatar_url === "string" && meta.avatar_url.trim()) ||
      (typeof meta?.picture === "string" && meta.picture.trim()) ||
      null;
    if (!displayName) {
      displayName =
        (typeof meta?.full_name === "string" ? meta.full_name : null) ??
        (typeof meta?.name === "string" ? meta.name : null);
    }
  } catch {
    /* optional */
  }

  return {
    found: true,
    profile: {
      user_id: matchedUserId,
      display_name: displayName,
      custom_tag_name: customTagName,
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
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
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
      return c.json(result);
    } catch {
      return c.json({ error: "lookup_failed" }, 500);
    }
  });

  app.post("/v1/passenger-authorizations", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
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

    const { db, tables: t } = await deps.getContactsDb();
    const token = generateToken(16);
    const expiresAt = new Date(Date.now() + AUTH_TTL_HOURS * 3600_000).toISOString();

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
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
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
