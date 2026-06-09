import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import { ACTIVE_RIDE_STATUSES, isDelegatedBooking } from "./rideAccess.ts";
import {
  listTripIntentsTargetingBooker,
  mapTripIntentHubItem,
  reconcileTripIntentWithRide,
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

function mapRideAsPassenger(
  row: Record<string, unknown>,
  counterpartyName?: string | null,
) {
  return {
    kind: "ride" as const,
    ride_id: String(row.id),
    status: String(row.status),
    roam_mode: String(row.roam_mode ?? "open_roam"),
    counterparty_name: counterpartyName ?? null,
    pickup_address: typeof row.pickup_address === "string" ? row.pickup_address : null,
    dropoff_address: typeof row.dropoff_address === "string" ? row.dropoff_address : null,
    created_at: String(row.created_at),
  };
}

function dedupeRideRows(
  rows: ReturnType<typeof mapRideAsBooker>[],
): ReturnType<typeof mapRideAsBooker>[] {
  const seen = new Set<string>();
  const kept: ReturnType<typeof mapRideAsBooker>[] = [];
  for (const row of rows) {
    if (seen.has(row.ride_id)) continue;
    seen.add(row.ride_id);
    kept.push(row);
  }
  return kept;
}

async function loadDisplayNamesForUsers(
  contactsDb: SupabaseClient,
  tagsTable: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;

  const { data: tags } = await contactsDb.from(tagsTable)
    .select("user_id, display_name, custom_tag_name")
    .in("user_id", unique);
  for (const row of tags ?? []) {
    const userId = String((row as Record<string, unknown>).user_id);
    const display = (row as Record<string, unknown>).display_name;
    const tag = (row as Record<string, unknown>).custom_tag_name;
    const label =
      (typeof display === "string" && display.trim()) ||
      (typeof tag === "string" && tag.trim()) ||
      null;
    if (label) names.set(userId, label);
  }
  return names;
}

/** Live rides linked via booked trip intents (covers book-for-me when passenger_user_id is unset). */
async function loadLiveRidesFromBookedIntents(
  contactsDb: SupabaseClient,
  rideDb: SupabaseClient,
  table: string,
  tagsTable: string,
  userId: string,
  role: "requester" | "payer",
  statuses: readonly string[],
): Promise<ReturnType<typeof mapRideAsBooker>[]> {
  const ownerCol = role === "requester" ? "requester_user_id" : "claimed_by_user_id";
  const { data: intents } = await contactsDb.from(table)
    .select("id, ride_request_id, requester_name, claimed_by_user_id")
    .eq(ownerCol, userId)
    .eq("status", "booked")
    .not("ride_request_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (!intents?.length) return [];

  const rideIds = [...new Set(
    intents
      .map((row) => (row as Record<string, unknown>).ride_request_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  )];
  if (rideIds.length === 0) return [];

  const { data: rides } = await rideDb.from("ride_requests")
    .select(RIDE_COLUMNS)
    .in("id", rideIds)
    .in("status", [...statuses]);
  if (!rides?.length) return [];

  const rideById = new Map(
    rides.map((row) => [String((row as Record<string, unknown>).id), row as Record<string, unknown>]),
  );

  let payerNames = new Map<string, string>();
  if (role === "requester") {
    const payerIds = intents
      .map((row) => (row as Record<string, unknown>).claimed_by_user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    payerNames = await loadDisplayNamesForUsers(contactsDb, tagsTable, payerIds);
  }

  const items: ReturnType<typeof mapRideAsBooker>[] = [];
  for (const intent of intents) {
    const record = intent as Record<string, unknown>;
    const rideId = record.ride_request_id ? String(record.ride_request_id) : null;
    if (!rideId) continue;
    const ride = rideById.get(rideId);
    if (!ride) continue;

    if (role === "payer") {
      if (!isDelegatedBooking(ride)) continue;
      items.push(mapRideAsBooker(ride));
      continue;
    }

    items.push(
      mapRideAsPassenger(
        ride,
        typeof record.claimed_by_user_id === "string"
          ? payerNames.get(String(record.claimed_by_user_id)) ?? null
          : null,
      ),
    );
  }
  return items;
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

async function reconcileRequesterIntents(
  svc: () => SupabaseClient,
  contactsDb: SupabaseClient,
  table: string,
  intents: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const kept: Record<string, unknown>[] = [];

  for (const row of intents) {
    const status = String(row.status);
    if (["claimed", "booked"].includes(status)) {
      const reconciled = await reconcileTripIntentWithRide(svc(), contactsDb, table, row);
      if (!reconciled || String(reconciled.status) === "cancelled") continue;
      kept.push({ ...reconciled, can_cancel: true });
      continue;
    }
    kept.push({ ...row, can_cancel: true });
  }

  return kept;
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

    let bookForSomeoneRides = (asBooker ?? [])
      .filter((row) => isDelegatedBooking(row as Record<string, unknown>))
      .map((row) => mapRideAsBooker(row as Record<string, unknown>));

    let bookForMeRides = (asPassenger ?? [])
      .filter((row) => {
        const ride = row as Record<string, unknown>;
        return isDelegatedBooking(ride) ||
          (typeof ride.booking_request_id === "string" && ride.booking_request_id.length > 0);
      })
      .map((row) => mapRideAsPassenger(row as Record<string, unknown>));

    let bookForMeIntents: ReturnType<typeof mapIntent>[] = [];
    let targetedIntents: ReturnType<typeof mapIntent>[] = [];
    let requesterBookedIntentIds = new Set<string>();
    let payerBookedIntentIds = new Set<string>();
    const bookerPhone = resolveBookerPhone(auth.user);

    try {
      const { db: contactsDb, tables: t } = await deps.getContactsDb();

      const [intentRideLoads, { data: intents, error: intentsError }, targetingRows] = await Promise.all([
        Promise.all([
          loadLiveRidesFromBookedIntents(
            contactsDb,
            db,
            t.booking_requests,
            t.roam_passenger_tags,
            userId,
            "requester",
            statuses,
          ),
          loadLiveRidesFromBookedIntents(
            contactsDb,
            db,
            t.booking_requests,
            t.roam_passenger_tags,
            userId,
            "payer",
            statuses,
          ),
        ]),
        contactsDb.from(t.booking_requests)
          .select(INTENT_COLUMNS)
          .eq("requester_user_id", userId)
          .in("status", [...INTENT_HUB_STATUSES])
          .order("created_at", { ascending: false })
          .limit(10),
        listTripIntentsTargetingBooker(contactsDb, t.booking_requests, userId, bookerPhone, deps.svc()),
      ]);

      const [requesterIntentRides, payerIntentRides] = intentRideLoads;
      bookForMeRides = dedupeRideRows([
        ...bookForMeRides,
        ...requesterIntentRides,
      ] as ReturnType<typeof mapRideAsBooker>[]);
      bookForSomeoneRides = dedupeRideRows([
        ...bookForSomeoneRides,
        ...payerIntentRides,
      ]);

      const { data: requesterBooked } = await contactsDb.from(t.booking_requests)
        .select("id")
        .eq("requester_user_id", userId)
        .eq("status", "booked")
        .not("ride_request_id", "is", null);
      requesterBookedIntentIds = new Set(
        (requesterBooked ?? []).map((row) => String((row as Record<string, unknown>).id)),
      );

      const { data: payerBooked } = await contactsDb.from(t.booking_requests)
        .select("id")
        .eq("claimed_by_user_id", userId)
        .eq("status", "booked")
        .not("ride_request_id", "is", null);
      payerBookedIntentIds = new Set(
        (payerBooked ?? []).map((row) => String((row as Record<string, unknown>).id)),
      );

      if (intentsError) {
        console.error("[book_for_others] intents_query_failed", intentsError.message);
      } else {
        const freshRows = (intents ?? [])
          .filter((row) => !isExpired((row as Record<string, unknown>).expires_at as string | null))
          .map((row) => row as Record<string, unknown>);
        const reconciled = await reconcileRequesterIntents(
          deps.svc,
          contactsDb,
          t.booking_requests,
          freshRows,
        );
        bookForMeIntents = reconciled.map((row) => mapIntent(row, "requester"));
      }

      targetedIntents = targetingRows.map((row) => mapIntent(row, "target_booker"));
    } catch (e) {
      console.error("[book_for_others] contacts_db_failed", e instanceof Error ? e.message : String(e));
    }

    const linkedIntentIds = new Set([
      ...(asPassenger ?? [])
        .map((row) => (row as Record<string, unknown>).booking_request_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
      ...requesterBookedIntentIds,
    ]);

    const intentsWithoutRide = bookForMeIntents.filter(
      (item) => !linkedIntentIds.has(item.intent_id),
    );

    const bookForMe = [...bookForMeRides, ...intentsWithoutRide].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const intentsWithLiveRide = new Set([
      ...(asBooker ?? [])
        .filter((row) => isDelegatedBooking(row as Record<string, unknown>))
        .map((row) => (row as Record<string, unknown>).booking_request_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
      ...payerBookedIntentIds,
    ]);
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
