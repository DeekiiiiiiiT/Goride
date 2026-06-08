import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import { ACTIVE_RIDE_STATUSES, isDelegatedBooking } from "./rideAccess.ts";
import {
  listTripIntentsTargetingBooker,
  mapTripIntentHubItem,
} from "./tripIntents.ts";

const RIDE_COLUMNS =
  "id, status, roam_mode, guest_passenger_name, guest_passenger_phone, passenger_user_id, rider_user_id, pickup_address, dropoff_address, created_at, booking_request_id";
const INTENT_COLUMNS =
  "id, status, roam_mode, pickup_address, dropoff_address, fare_estimate_minor, currency, created_at, expires_at, requester_user_id, requester_name, ride_request_id";
const INTENT_HUB_STATUSES = ["draft", "published", "claimed", "booked", "pending"] as const;

export type BookForOthersActivityDeps = {
  svc: () => SupabaseClient;
  getContactsDb: () => Promise<RidesContactsDb>;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: 401 }
  >;
};

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) <= new Date();
}

function mapRideAsBooker(row: Record<string, unknown>) {
  return {
    kind: "ride" as const,
    ride_id: String(row.id),
    status: String(row.status),
    roam_mode: String(row.roam_mode ?? "open_roam"),
    counterparty_name:
      typeof row.guest_passenger_name === "string" ? row.guest_passenger_name : null,
    pickup_address: typeof row.pickup_address === "string" ? row.pickup_address : null,
    dropoff_address: typeof row.dropoff_address === "string" ? row.dropoff_address : null,
    created_at: String(row.created_at),
  };
}

function mapRideAsPassenger(row: Record<string, unknown>) {
  return {
    kind: "ride" as const,
    ride_id: String(row.id),
    status: String(row.status),
    roam_mode: String(row.roam_mode ?? "open_roam"),
    counterparty_name: null,
    pickup_address: typeof row.pickup_address === "string" ? row.pickup_address : null,
    dropoff_address: typeof row.dropoff_address === "string" ? row.dropoff_address : null,
    created_at: String(row.created_at),
  };
}

function mapIntent(row: Record<string, unknown>, role: "requester" | "target_booker" = "requester") {
  return mapTripIntentHubItem(row, role);
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

export function registerBookForOthersActivityRoutes(
  app: Hono,
  deps: BookForOthersActivityDeps,
) {
  app.get("/v1/book-for-others/activity", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const userId = auth.user.id;
    const db = deps.svc();
    const statuses = [...ACTIVE_RIDE_STATUSES];

    const [{ data: asBooker }, { data: asPassenger }] = await Promise.all([
      db.from("ride_requests")
        .select(RIDE_COLUMNS)
        .eq("rider_user_id", userId)
        .in("status", statuses)
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("ride_requests")
        .select(RIDE_COLUMNS)
        .eq("passenger_user_id", userId)
        .in("status", statuses)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const bookForSomeoneRides = (asBooker ?? [])
      .filter((row) => isDelegatedBooking(row as Record<string, unknown>))
      .map((row) => mapRideAsBooker(row as Record<string, unknown>));

    const bookForMeRides = (asPassenger ?? []).map((row) =>
      mapRideAsPassenger(row as Record<string, unknown>)
    );

    let bookForMeIntents: ReturnType<typeof mapIntent>[] = [];
    let targetedIntents: ReturnType<typeof mapIntent>[] = [];
    const bookerPhone = resolveBookerPhone(auth.user);

    try {
      const { db: contactsDb, tables: t } = await deps.getContactsDb();

      const [{ data: intents, error: intentsError }, targetingRows] = await Promise.all([
        contactsDb.from(t.booking_requests)
          .select(INTENT_COLUMNS)
          .eq("requester_user_id", userId)
          .in("status", [...INTENT_HUB_STATUSES])
          .order("created_at", { ascending: false })
          .limit(10),
        listTripIntentsTargetingBooker(contactsDb, t.booking_requests, userId, bookerPhone),
      ]);

      if (intentsError) {
        console.error("[book_for_others] intents_query_failed", intentsError.message);
      } else {
        bookForMeIntents = (intents ?? [])
          .filter((row) => !isExpired((row as Record<string, unknown>).expires_at as string | null))
          .map((row) => mapIntent(row as Record<string, unknown>, "requester"));
      }

      targetedIntents = targetingRows.map((row) => mapIntent(row, "target_booker"));
    } catch (e) {
      console.error("[book_for_others] contacts_db_failed", e instanceof Error ? e.message : String(e));
    }

    const linkedIntentIds = new Set(
      (asPassenger ?? [])
        .map((row) => (row as Record<string, unknown>).booking_request_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );

    const intentsWithoutRide = bookForMeIntents.filter(
      (item) => !linkedIntentIds.has(item.intent_id),
    );

    const bookForMe = [...intentsWithoutRide, ...bookForMeRides].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const intentsWithLiveRide = new Set(
      (asBooker ?? [])
        .filter((row) => isDelegatedBooking(row as Record<string, unknown>))
        .map((row) => (row as Record<string, unknown>).booking_request_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    const targetedIntentsVisible = targetedIntents.filter(
      (item) => !intentsWithLiveRide.has(String(item.intent_id)),
    );

    const bookForSomeone = [...bookForSomeoneRides, ...targetedIntentsVisible].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return c.json({
      book_for_someone: bookForSomeone,
      book_for_me: bookForMe,
    });
  });
}
