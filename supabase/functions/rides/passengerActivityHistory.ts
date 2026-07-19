import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowsPassengerSurface, jsonEdgeForbidden } from "../_shared/authEdge.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import {
  getRideParticipantRole,
  isDelegatedBooking,
  TERMINAL_RIDE_STATUSES,
} from "./rideAccess.ts";
import { loadRideRowsByIds } from "./rideHubQueries.ts";
import { sanitizeActivityRideForBooker } from "./shadowBookerPrivacy.ts";
import { enrichRideRoamModeFromBooking } from "./roamModeResolve.ts";

export const HISTORY_RIDE_COLUMNS =
  "id, status, roam_mode, guest_passenger_name, guest_passenger_phone, passenger_user_id, rider_user_id, pickup_address, dropoff_address, created_at, updated_at, completed_at, fare_estimate_minor, fare_final_minor, currency, booking_request_id";

const HISTORY_RIDE_COLUMNS_FALLBACK =
  "id, status, guest_passenger_name, passenger_user_id, rider_user_id, pickup_address, dropoff_address, created_at, updated_at, completed_at, fare_estimate_minor, fare_final_minor, currency";

const TERMINAL_STATUS_SET = new Set<string>(TERMINAL_RIDE_STATUSES);
const INTENT_TERMINAL_STATUSES = ["consumed", "booked"] as const;
const FETCH_CAP = 100;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
export const ACTIVITY_HISTORY_WINDOW_DAYS = 5;
const NATIVE_TABLE = "ride_requests";
const PUBLIC_TABLE = "rides_ride_requests";

export type ActivityTripParticipantRole = "booker" | "passenger";
export type ActivityTripCategory = "for_others" | "for_me" | "self";

export type ActivityTripHistoryItem = {
  kind: "ride";
  ride_id: string;
  status: "completed" | "cancelled";
  roam_mode: "open_roam" | "shadow_roam";
  participant_role: ActivityTripParticipantRole;
  trip_category: ActivityTripCategory;
  counterparty_name: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  fare_estimate_minor: string | null;
  currency: string | null;
  created_at: string;
  ended_at: string;
};

type HistoryCandidate = {
  ride: Record<string, unknown>;
  participant_role: ActivityTripParticipantRole;
};

export type PassengerActivityHistoryDeps = {
  svc: () => SupabaseClient;
  pubSvc: () => SupabaseClient;
  getContactsDb: () => Promise<RidesContactsDb>;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: 401 }
  >;
};

export function isTerminalRideStatus(status: unknown): boolean {
  return TERMINAL_STATUS_SET.has(String(status ?? ""));
}

export function classifyTripCategory(
  ride: Record<string, unknown>,
  userId: string,
  participantRole: ActivityTripParticipantRole,
): ActivityTripCategory {
  const riderId = ride.rider_user_id ? String(ride.rider_user_id) : null;
  const passengerId = ride.passenger_user_id ? String(ride.passenger_user_id) : null;
  if (riderId === userId && passengerId === userId) return "self";
  const delegated = isDelegatedBooking(ride);
  if (participantRole === "booker" && delegated) return "for_others";
  if (participantRole === "passenger" && delegated) return "for_me";
  return "self";
}

export function encodeActivityCursor(endedAt: string, rideId: string): string {
  return `${endedAt}|${rideId}`;
}

export function historyWindowSinceIso(days: number, now = new Date()): string {
  const clamped = Math.max(1, Math.min(Math.floor(days), 30));
  const since = new Date(now);
  since.setDate(since.getDate() - clamped);
  return since.toISOString();
}

export function isWithinHistoryWindow(endedAt: string, days: number, now = new Date()): boolean {
  const ended = new Date(endedAt).getTime();
  const since = new Date(historyWindowSinceIso(days, now)).getTime();
  return Number.isFinite(ended) && ended >= since;
}

export function parseActivityCursor(raw: string | null | undefined): { ended_at: string; ride_id: string } | null {
  if (!raw?.trim()) return null;
  const parts = raw.split("|");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { ended_at: parts[0], ride_id: parts[1] };
}

function compareHistoryItems(a: ActivityTripHistoryItem, b: ActivityTripHistoryItem): number {
  const aEnded = new Date(a.ended_at).getTime();
  const bEnded = new Date(b.ended_at).getTime();
  if (bEnded !== aEnded) return bEnded - aEnded;
  return b.ride_id.localeCompare(a.ride_id);
}

function isBeforeCursor(item: ActivityTripHistoryItem, cursor: { ended_at: string; ride_id: string }): boolean {
  const itemEnded = new Date(item.ended_at).getTime();
  const cursorEnded = new Date(cursor.ended_at).getTime();
  if (itemEnded < cursorEnded) return true;
  if (itemEnded > cursorEnded) return false;
  return item.ride_id < cursor.ride_id;
}

export function mergeHistoryCandidates(
  candidates: HistoryCandidate[],
  userId: string,
  counterpartyNames: Map<string, string>,
): ActivityTripHistoryItem[] {
  const byRideId = new Map<string, HistoryCandidate>();

  for (const candidate of candidates) {
    const rideId = String(candidate.ride.id);
    const existing = byRideId.get(rideId);
    if (!existing) {
      byRideId.set(rideId, candidate);
      continue;
    }
    const riderId = candidate.ride.rider_user_id ? String(candidate.ride.rider_user_id) : null;
    const passengerId = candidate.ride.passenger_user_id ? String(candidate.ride.passenger_user_id) : null;
    if (riderId === userId && passengerId === userId) {
      byRideId.set(rideId, candidate);
    }
  }

  const items: ActivityTripHistoryItem[] = [];
  for (const { ride, participant_role } of byRideId.values()) {
    const mapped = mapRideToHistoryItem(ride, userId, participant_role, counterpartyNames);
    if (mapped) items.push(mapped);
  }
  items.sort(compareHistoryItems);
  return items;
}

export function paginateActivityTrips(
  items: ActivityTripHistoryItem[],
  limit: number,
  cursor: { ended_at: string; ride_id: string } | null,
): { trips: ActivityTripHistoryItem[]; next_cursor: string | null } {
  const filtered = cursor
    ? items.filter((item) => isBeforeCursor(item, cursor))
    : items;
  const page = filtered.slice(0, limit);
  const last = page[page.length - 1];
  const next_cursor = page.length === limit && last
    ? encodeActivityCursor(last.ended_at, last.ride_id)
    : null;
  return { trips: page, next_cursor };
}

function resolveCounterpartyName(
  ride: Record<string, unknown>,
  participantRole: ActivityTripParticipantRole,
  counterpartyNames: Map<string, string>,
): string | null {
  if (participantRole === "booker") {
    return typeof ride.guest_passenger_name === "string"
      ? ride.guest_passenger_name
      : null;
  }
  const bookerId = ride.rider_user_id ? String(ride.rider_user_id) : null;
  if (bookerId) return counterpartyNames.get(bookerId) ?? null;
  return null;
}

export function mapRideToHistoryItem(
  ride: Record<string, unknown>,
  userId: string,
  participantRole: ActivityTripParticipantRole,
  counterpartyNames: Map<string, string>,
): ActivityTripHistoryItem | null {
  const status = String(ride.status ?? "");
  if (!isTerminalRideStatus(status)) return null;

  const roamMode = String(ride.roam_mode ?? "open_roam") as "open_roam" | "shadow_roam";
  const counterpartyName = resolveCounterpartyName(ride, participantRole, counterpartyNames);
  const tripCategory = classifyTripCategory(ride, userId, participantRole);
  const endedAt = String(ride.completed_at ?? ride.updated_at ?? ride.created_at ?? "");
  const fareRaw = ride.fare_final_minor ?? ride.fare_estimate_minor;
  const fareMinor = fareRaw != null ? String(fareRaw) : null;
  const currency = typeof ride.currency === "string" ? ride.currency : null;

  const base = {
    kind: "ride" as const,
    ride_id: String(ride.id),
    status: status as "completed" | "cancelled",
    roam_mode: roamMode,
    participant_role: participantRole,
    trip_category: tripCategory,
    counterparty_name: counterpartyName,
    pickup_address: typeof ride.pickup_address === "string" ? ride.pickup_address : null,
    dropoff_address: typeof ride.dropoff_address === "string" ? ride.dropoff_address : null,
    fare_estimate_minor: fareMinor,
    currency,
    created_at: String(ride.created_at ?? ""),
    ended_at: endedAt,
  };

  if (participantRole === "booker") {
    return sanitizeActivityRideForBooker(base) as ActivityTripHistoryItem;
  }
  return base;
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

async function queryTerminalRidesForUserOnTable(
  db: SupabaseClient,
  table: string,
  userId: string,
  columns: string,
  windowStartIso: string,
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const statuses = [...TERMINAL_RIDE_STATUSES];

  const runRole = async (roleCol: "rider_user_id" | "passenger_user_id") => {
    const { data, error } = await db.from(table)
      .select(columns)
      .in("status", statuses)
      .eq(roleCol, userId)
      .gte("updated_at", windowStartIso)
      .order("updated_at", { ascending: false })
      .limit(FETCH_CAP);
    return { data: (data ?? []) as Record<string, unknown>[], error };
  };

  const [asRider, asPassenger] = await Promise.all([
    runRole("rider_user_id"),
    runRole("passenger_user_id"),
  ]);

  const error = asRider.error?.message ?? asPassenger.error?.message ?? null;
  if (error) {
    return { rows: [], error };
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const row of [...asRider.data, ...asPassenger.data]) {
    byId.set(String(row.id), row);
  }
  return { rows: [...byId.values()], error: null };
}

async function queryUserTerminalRidesSince(
  nativeDb: SupabaseClient,
  publicDb: SupabaseClient,
  userId: string,
  windowDays: number,
): Promise<Record<string, unknown>[]> {
  const byId = new Map<string, Record<string, unknown>>();
  const windowStartIso = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const ingest = (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      byId.set(String(row.id), row);
    }
  };

  for (const columns of [HISTORY_RIDE_COLUMNS, HISTORY_RIDE_COLUMNS_FALLBACK]) {
    const [native, pub] = await Promise.all([
      queryTerminalRidesForUserOnTable(nativeDb, NATIVE_TABLE, userId, columns, windowStartIso),
      queryTerminalRidesForUserOnTable(publicDb, PUBLIC_TABLE, userId, columns, windowStartIso),
    ]);

    if (!native.error) ingest(native.rows);
    if (!pub.error) ingest(pub.rows);

    if (byId.size > 0 || (!native.error && !pub.error)) {
      return [...byId.values()];
    }

    console.error(
      "[activity_history] terminal_rides_query_failed",
      native.error ?? pub.error,
    );
  }

  return [...byId.values()];
}

async function loadTerminalRidesFromIntents(
  getContactsDb: () => Promise<RidesContactsDb>,
  rideDb: SupabaseClient,
  publicDb: SupabaseClient,
  userId: string,
): Promise<HistoryCandidate[]> {
  const { db: contactsDb, tables: t } = await getContactsDb();
  const table = t.booking_requests;

  const [{ data: asRequester }, { data: asPayer }] = await Promise.all([
    contactsDb.from(table)
      .select("id, ride_request_id, claimed_by_user_id")
      .eq("requester_user_id", userId)
      .in("status", [...INTENT_TERMINAL_STATUSES])
      .not("ride_request_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(FETCH_CAP),
    contactsDb.from(table)
      .select("id, ride_request_id, claimed_by_user_id")
      .eq("claimed_by_user_id", userId)
      .in("status", [...INTENT_TERMINAL_STATUSES])
      .not("ride_request_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(FETCH_CAP),
  ]);

  const intentRows: Array<{ row: Record<string, unknown>; role: ActivityTripParticipantRole }> = [];
  const rideIds: string[] = [];
  const seenRideIds = new Set<string>();

  for (const row of asRequester ?? []) {
    const rideId = (row as Record<string, unknown>).ride_request_id
      ? String((row as Record<string, unknown>).ride_request_id)
      : null;
    if (!rideId || seenRideIds.has(rideId)) continue;
    seenRideIds.add(rideId);
    rideIds.push(rideId);
    intentRows.push({ row: row as Record<string, unknown>, role: "passenger" });
  }
  for (const row of asPayer ?? []) {
    const rideId = (row as Record<string, unknown>).ride_request_id
      ? String((row as Record<string, unknown>).ride_request_id)
      : null;
    if (!rideId || seenRideIds.has(rideId)) continue;
    seenRideIds.add(rideId);
    rideIds.push(rideId);
    intentRows.push({ row: row as Record<string, unknown>, role: "booker" });
  }

  const rideMap = await loadRideRowsByIds(rideDb, publicDb, rideIds, HISTORY_RIDE_COLUMNS);
  const candidates: HistoryCandidate[] = [];

  for (const { row, role } of intentRows) {
    const rideId = row.ride_request_id ? String(row.ride_request_id) : null;
    if (!rideId) continue;
    const ride = rideMap.get(rideId);
    if (!ride || !isTerminalRideStatus(ride.status)) continue;
    const enriched = await enrichRideRoamModeFromBooking(ride, getContactsDb, rideDb);
    const resolvedRole = getRideParticipantRole(enriched, userId);
    candidates.push({
      ride: enriched,
      participant_role: resolvedRole === "booker" || resolvedRole === "passenger"
        ? resolvedRole
        : role,
    });
  }

  return candidates;
}

function parseLimit(raw: string | null): number {
  const n = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function parseWindowDays(raw: string | null): number {
  const n = Number(raw ?? ACTIVITY_HISTORY_WINDOW_DAYS);
  if (!Number.isFinite(n) || n < 1) return ACTIVITY_HISTORY_WINDOW_DAYS;
  return Math.min(Math.floor(n), 30);
}

function resolveParticipantRole(
  ride: Record<string, unknown>,
  userId: string,
): ActivityTripParticipantRole {
  const role = getRideParticipantRole(ride, userId);
  if (role === "passenger") return "passenger";
  return "booker";
}

export async function buildActivityTripHistory(
  deps: PassengerActivityHistoryDeps,
  userId: string,
  limit: number,
  cursor: { ended_at: string; ride_id: string } | null,
  windowDays = ACTIVITY_HISTORY_WINDOW_DAYS,
): Promise<{ trips: ActivityTripHistoryItem[]; next_cursor: string | null; window_days: number }> {
  const db = deps.svc();
  const pub = deps.pubSvc();

  const [terminalRides, intentCandidates] = await Promise.all([
    queryUserTerminalRidesSince(db, pub, userId, windowDays),
    loadTerminalRidesFromIntents(deps.getContactsDb, db, pub, userId),
  ]);

  const enrichRide = (row: Record<string, unknown>) =>
    enrichRideRoamModeFromBooking(row, deps.getContactsDb, db);

  const enrichedTerminal = await Promise.all(terminalRides.map((row) => enrichRide(row)));

  const candidates: HistoryCandidate[] = [
    ...enrichedTerminal.map((ride) => ({
      ride,
      participant_role: resolveParticipantRole(ride, userId),
    })),
    ...intentCandidates,
  ];

  const bookerIds = new Set<string>();
  for (const { ride, participant_role } of candidates) {
    if (participant_role === "passenger" && ride.rider_user_id) {
      bookerIds.add(String(ride.rider_user_id));
    }
  }

  let counterpartyNames = new Map<string, string>();
  try {
    const { db: contactsDb, tables: t } = await deps.getContactsDb();
    counterpartyNames = await loadDisplayNamesForUsers(
      contactsDb,
      t.roam_passenger_tags,
      [...bookerIds],
    );
  } catch {
    /* non-fatal — names optional */
  }

  const merged = mergeHistoryCandidates(candidates, userId, counterpartyNames)
    .filter((item) => item.ended_at && isWithinHistoryWindow(item.ended_at, windowDays));
  const page = paginateActivityTrips(merged, limit, cursor);
  return { ...page, window_days: windowDays };
}

export function registerPassengerActivityHistoryRoutes(
  app: Hono,
  deps: PassengerActivityHistoryDeps,
) {
  app.get("/v1/activity/trips", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (!allowsPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const limit = parseLimit(c.req.query("limit") ?? null);
    const cursor = parseActivityCursor(c.req.query("cursor"));
    const windowDays = parseWindowDays(c.req.query("days") ?? null);

    const result = await buildActivityTripHistory(
      deps,
      auth.user.id,
      limit,
      cursor,
      windowDays,
    );

    return c.json(result);
  });
}
