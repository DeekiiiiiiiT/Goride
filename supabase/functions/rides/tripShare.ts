/**
 * Trusted contact trip sharing: tokenized SMS links + public read-only view.
 * Tokens expire when the ride completes/cancels or after TTL.
 */
import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deniesPassengerSurface, jsonEdgeForbidden } from "../_shared/authEdge.ts";
import type { RidesContactsDb, RidesContactsTables } from "../_shared/ridesContactsDb.ts";
import { getRiderAdminDb } from "../_shared/ridesAdminDb.ts";
import {
  canAccessRide,
  generateToken,
  normalizePhoneE164,
  tripShareUrl,
} from "./rideAccess.ts";
import { sendRideNotification } from "./rideNotifications.ts";

const SHARE_TTL_HOURS = 48;
const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

export type ShareKind = "manual" | "auto" | "emergency" | "test";

type TripShareDeps = {
  getContactsDb: () => Promise<RidesContactsDb>;
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

type SafetyPrefs = {
  default_sharing_preference: "all" | "night" | "manual";
  share_all_trips: boolean;
  night_trips_only: boolean;
};

/** 9 PM – 6 AM local hour window for night-only auto-share. */
export function isNightTripWindow(isoTimestamp: string, timezoneOffsetMinutes = 0): boolean {
  const d = new Date(isoTimestamp);
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const localMinutes = ((utcMinutes - timezoneOffsetMinutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const hour = Math.floor(localMinutes / 60);
  return hour >= 21 || hour < 6;
}

function riderFirstName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  if (!trimmed) return "Someone";
  return trimmed.split(/\s+/)[0] ?? "Someone";
}

function shareExpiresAt(ride: Record<string, unknown>): string {
  return new Date(Date.now() + SHARE_TTL_HOURS * 3600_000).toISOString();
}

async function loadSafetyPrefs(
  db: SupabaseClient,
  profileTable: string,
  userId: string,
): Promise<SafetyPrefs> {
  const { data } = await db.from(profileTable)
    .select("default_sharing_preference, share_all_trips, night_trips_only")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    return { default_sharing_preference: "all", share_all_trips: true, night_trips_only: false };
  }
  return {
    default_sharing_preference: (data.default_sharing_preference as SafetyPrefs["default_sharing_preference"]) ?? "all",
    share_all_trips: Boolean(data.share_all_trips),
    night_trips_only: Boolean(data.night_trips_only),
  };
}

async function loadRiderDisplayName(
  db: SupabaseClient,
  profileTable: string,
  userId: string,
): Promise<string | null> {
  const { data } = await db.from(profileTable).select("display_name").eq("user_id", userId).maybeSingle();
  return (data?.display_name as string | null) ?? null;
}

async function loadTrustedContacts(
  db: SupabaseClient,
  tables: RidesContactsTables,
  ownerId: string,
  contactIds?: string[],
): Promise<Record<string, unknown>[]> {
  let query = db.from(tables.rider_contacts)
    .select("*")
    .eq("owner_user_id", ownerId)
    .eq("trusted_for_safety", true);
  if (contactIds?.length) {
    query = query.in("id", contactIds);
  }
  const { data } = await query;
  return data ?? [];
}

async function resolveGroupContactIds(
  db: SupabaseClient,
  tables: RidesContactsTables,
  ownerId: string,
  groupIds: string[],
): Promise<string[]> {
  if (!groupIds.length) return [];
  const { data: groups } = await db.from(tables.rider_contact_groups)
    .select("id")
    .eq("owner_user_id", ownerId)
    .in("id", groupIds);
  const validGroupIds = (groups ?? []).map((g) => g.id as string);
  if (!validGroupIds.length) return [];
  const { data: members } = await db.from(tables.rider_contact_group_members)
    .select("contact_id")
    .in("group_id", validGroupIds);
  return [...new Set((members ?? []).map((m) => m.contact_id as string))];
}

async function existingShareForContact(
  db: SupabaseClient,
  tables: RidesContactsTables,
  rideId: string,
  contactId: string,
  shareKind: ShareKind,
): Promise<boolean> {
  const { data } = await db.from(tables.ride_trip_shares)
    .select("id")
    .eq("ride_request_id", rideId)
    .eq("contact_id", contactId)
    .eq("share_kind", shareKind)
    .is("revoked_at", null)
    .maybeSingle();
  return Boolean(data?.id);
}

type ShareOneInput = {
  db: SupabaseClient;
  tables: RidesContactsTables;
  ride: Record<string, unknown> | null;
  ownerId: string;
  contact: Record<string, unknown>;
  shareKind: ShareKind;
  message?: string | null;
  groupId?: string | null;
  riderName: string;
  smsTemplate: "trip_share" | "trip_share_emergency" | "trip_share_test";
};

async function shareWithOneContact(input: ShareOneInput): Promise<string | null> {
  const { db, tables, ride, ownerId, contact, shareKind, message, groupId, riderName, smsTemplate } = input;
  const contactId = contact.id as string;
  const phone = normalizePhoneE164(String(contact.phone_e164));
  const rideId = ride?.id ? String(ride.id) : null;

  if (rideId) {
    const dup = await existingShareForContact(db, tables, rideId, contactId, shareKind);
    if (dup) return null;
  }

  const token = generateToken(16);
  const expiresAt = ride ? shareExpiresAt(ride) : new Date(Date.now() + 24 * 3600_000).toISOString();
  const now = new Date().toISOString();

  const { data: share, error } = await db.from(tables.ride_trip_shares).insert({
    ride_request_id: rideId,
    owner_user_id: ownerId,
    contact_id: contactId,
    group_id: groupId ?? null,
    phone_e164: phone,
    token,
    share_kind: shareKind,
    message: message?.trim() || null,
    expires_at: expiresAt,
    created_at: now,
  }).select("id").single();

  if (error || !share) {
    console.warn("[trip_share] insert failed:", error?.message);
    return null;
  }

  const url = tripShareUrl(token);
  const smsOk = await sendRideNotification({
    to: phone,
    template: smsTemplate,
    payload: { url, rider_name: riderName },
  });

  await db.from(tables.ride_trip_share_events).insert({
    trip_share_id: share.id,
    phone_e164: phone,
    sms_sent: smsOk,
    error_message: smsOk ? null : "sms_failed",
  });

  await db.from(tables.rider_contacts)
    .update({ last_shared_at: now, updated_at: now })
    .eq("id", contactId);

  return share.id as string;
}

async function shareWithContacts(
  deps: TripShareDeps,
  ownerId: string,
  contacts: Record<string, unknown>[],
  opts: {
    ride: Record<string, unknown> | null;
    shareKind: ShareKind;
    message?: string | null;
    groupId?: string | null;
    smsTemplate: "trip_share" | "trip_share_emergency" | "trip_share_test";
  },
): Promise<string[]> {
  const { db, tables } = await deps.getContactsDb();
  const { db: adminDb, tables: adminTables } = await getRiderAdminDb();
  const riderName = riderFirstName(await loadRiderDisplayName(adminDb, adminTables.rider_profiles, ownerId));
  const shareIds: string[] = [];

  for (const contact of contacts) {
    const id = await shareWithOneContact({
      db,
      tables,
      ride: opts.ride,
      ownerId,
      contact,
      shareKind: opts.shareKind,
      message: opts.message,
      groupId: opts.groupId,
      riderName,
      smsTemplate: opts.smsTemplate,
    });
    if (id) shareIds.push(id);
  }

  return shareIds;
}

export async function maybeAutoShareWithTrustedContacts(
  deps: TripShareDeps,
  ride: Record<string, unknown>,
  timezoneOffsetMinutes = 0,
): Promise<number> {
  const ownerId = String(ride.rider_user_id ?? "");
  if (!ownerId) return 0;
  if (TERMINAL_STATUSES.has(String(ride.status))) return 0;

  const { db: adminDb, tables: adminTables } = await getRiderAdminDb();
  const prefs = await loadSafetyPrefs(adminDb, adminTables.rider_profiles, ownerId);
  const nowIso = new Date().toISOString();

  if (prefs.default_sharing_preference === "manual") return 0;
  if (prefs.default_sharing_preference === "night" && !isNightTripWindow(nowIso, timezoneOffsetMinutes)) {
    return 0;
  }

  const { db, tables } = await deps.getContactsDb();
  const contacts = await loadTrustedContacts(db, tables, ownerId);
  if (!contacts.length) return 0;

  const shareIds = await shareWithContacts(deps, ownerId, contacts, {
    ride,
    shareKind: "auto",
    smsTemplate: "trip_share",
  });

  if (shareIds.length) {
    await deps.audit(String(ride.id), ownerId, "trip_auto_shared", { count: shareIds.length });
  }
  return shareIds.length;
}

function sanitizePublicTripShare(
  share: Record<string, unknown>,
  ride: Record<string, unknown> | null,
  riderName: string,
): Record<string, unknown> {
  const expired =
    new Date(String(share.expires_at)) <= new Date() ||
    Boolean(share.revoked_at) ||
    (ride ? TERMINAL_STATUSES.has(String(ride.status)) : false);

  return {
    token: share.token,
    rider_first_name: riderName,
    status: ride ? String(ride.status) : "completed",
    pickup_address: ride ? (ride.pickup_address as string | null) ?? null : null,
    dropoff_address: ride ? (ride.dropoff_address as string | null) ?? null : null,
    vehicle_label: ride?.vehicle_option ? String(ride.vehicle_option) : null,
    eta_pickup_seconds_estimate: ride?.eta_pickup_seconds_estimate != null
      ? Number(ride.eta_pickup_seconds_estimate)
      : null,
    eta_dropoff_seconds_estimate: ride?.eta_dropoff_seconds_estimate != null
      ? Number(ride.eta_dropoff_seconds_estimate)
      : null,
    driver_lat: ride?.last_driver_lat != null ? Number(ride.last_driver_lat) : null,
    driver_lng: ride?.last_driver_lng != null ? Number(ride.last_driver_lng) : null,
    is_emergency: share.share_kind === "emergency",
    message: (share.message as string | null) ?? null,
    expires_at: share.expires_at,
    expired,
  };
}

export function registerTripShareRoutes(app: Hono, deps: TripShareDeps) {
  const requirePassenger = async (c: Context) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return { error: auth, response: c.json({ error: auth.error }, auth.status) };
    if (deniesPassengerSurface(auth.user)) {
      return { error: null, response: jsonEdgeForbidden(c, "forbidden_role") };
    }
    return { user: auth.user, response: null };
  };

  app.get("/v1/trip-shares/:token", async (c) => {
    const token = c.req.param("token");
    const { db, tables } = await deps.getContactsDb();
    const { data: share } = await db.from(tables.ride_trip_shares)
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (!share) return c.json({ error: "not_found" }, 404);

    let ride: Record<string, unknown> | null = null;
    if (share.ride_request_id) {
      ride = await deps.loadRideRequestById(String(share.ride_request_id));
    }

    const { db: adminDb, tables: adminTables } = await getRiderAdminDb();
    const riderName = riderFirstName(
      await loadRiderDisplayName(adminDb, adminTables.rider_profiles, String(share.owner_user_id)),
    );

    const payload = sanitizePublicTripShare(share as Record<string, unknown>, ride, riderName);
    if (payload.expired) {
      return c.json({ share: payload }, 410);
    }
    return c.json({ share: payload });
  });

  app.post("/v1/requests/:id/share-trip", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const rideId = c.req.param("id");
    const ride = await deps.loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);
    if (!canAccessRide(ride, gate.user!.id)) return jsonEdgeForbidden(c, "forbidden");
    if (TERMINAL_STATUSES.has(String(ride.status))) {
      return c.json({ error: "ride_terminal" }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const shareWithAll = body.share_with_all === true;
    const contactIds = Array.isArray(body.contact_ids)
      ? body.contact_ids.filter((id: unknown) => typeof id === "string")
      : [];
    const groupIds = Array.isArray(body.group_ids)
      ? body.group_ids.filter((id: unknown) => typeof id === "string")
      : [];

    const { db, tables } = await deps.getContactsDb();
    let targetIds = [...contactIds];
    if (groupIds.length) {
      const fromGroups = await resolveGroupContactIds(db, tables, gate.user!.id, groupIds);
      targetIds = [...new Set([...targetIds, ...fromGroups])];
    }

    let contacts: Record<string, unknown>[];
    if (shareWithAll) {
      contacts = await loadTrustedContacts(db, tables, gate.user!.id);
    } else if (targetIds.length) {
      contacts = await loadTrustedContacts(db, tables, gate.user!.id, targetIds);
    } else {
      return c.json({ error: "invalid_body", message: "Select contacts or enable share_with_all" }, 400);
    }

    if (!contacts.length) {
      return c.json({ error: "no_contacts" }, 400);
    }

    const shareIds = await shareWithContacts(deps, gate.user!.id, contacts, {
      ride,
      shareKind: "manual",
      message: message || null,
      smsTemplate: "trip_share",
    });

    await deps.audit(rideId, gate.user!.id, "trip_shared", { count: shareIds.length, contact_ids: targetIds });

    return c.json({ shared_count: shareIds.length, share_ids: shareIds });
  });

  app.post("/v1/trusted-contacts/test-share", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const body = await c.req.json().catch(() => ({}));
    const contactIds = Array.isArray(body.contact_ids)
      ? body.contact_ids.filter((id: unknown) => typeof id === "string")
      : [];
    if (!contactIds.length) return c.json({ error: "invalid_body" }, 400);

    const { db, tables } = await deps.getContactsDb();
    const contacts = await loadTrustedContacts(db, tables, gate.user!.id, contactIds);
    if (!contacts.length) return c.json({ error: "no_contacts" }, 400);

    const shareIds = await shareWithContacts(deps, gate.user!.id, contacts, {
      ride: null,
      shareKind: "test",
      smsTemplate: "trip_share_test",
    });

    await deps.audit(null, gate.user!.id, "trip_test_shared", { count: shareIds.length });

    return c.json({ sent_count: shareIds.length });
  });

  app.post("/v1/emergency/alert-trusted", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const body = await c.req.json().catch(() => ({}));
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const rideId = typeof body.ride_request_id === "string" ? body.ride_request_id.trim() : "";

    let ride: Record<string, unknown> | null = null;
    if (rideId) {
      ride = await deps.loadRideRequestById(rideId);
      if (ride && !canAccessRide(ride, gate.user!.id)) {
        return jsonEdgeForbidden(c, "forbidden");
      }
    }

    const { db, tables } = await deps.getContactsDb();
    const contacts = await loadTrustedContacts(db, tables, gate.user!.id);
    if (!contacts.length) return c.json({ error: "no_trusted_contacts" }, 400);

    const locationNote = lat != null && lng != null ? ` Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}` : "";
    const shareIds = await shareWithContacts(deps, gate.user!.id, contacts, {
      ride,
      shareKind: "emergency",
      message: locationNote || null,
      smsTemplate: "trip_share_emergency",
    });

    await deps.audit(ride?.id ? String(ride.id) : null, gate.user!.id, "emergency_trusted_alert", {
      count: shareIds.length,
      lat,
      lng,
    });

    return c.json({ sent_count: shareIds.length });
  });
}
