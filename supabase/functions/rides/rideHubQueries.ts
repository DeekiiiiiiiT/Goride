import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import { ACTIVE_RIDE_STATUSES, isDelegatedBooking } from "./rideAccess.ts";

const NATIVE_TABLE = "ride_requests";
const PUBLIC_TABLE = "rides_ride_requests";

export function isHubDelegatedRide(ride: Record<string, unknown>): boolean {
  return isDelegatedBooking(ride) ||
    (typeof ride.booking_request_id === "string" && ride.booking_request_id.length > 0);
}

type RideListFilter = {
  columns?: string;
  passenger_user_id?: string;
  rider_user_id?: string;
  booking_request_ids?: string[];
  statuses?: readonly string[];
  limit?: number;
};

export async function queryRideRequestsList(
  nativeDb: SupabaseClient,
  publicDb: SupabaseClient,
  filter: RideListFilter,
): Promise<Record<string, unknown>[]> {
  const columns = filter.columns ?? "*";
  const statuses = [...(filter.statuses ?? ACTIVE_RIDE_STATUSES)];
  const limit = filter.limit ?? 20;

  const run = async (db: SupabaseClient, table: string): Promise<Record<string, unknown>[]> => {
    let query = db.from(table).select(columns).in("status", statuses);
    if (filter.passenger_user_id) {
      query = query.eq("passenger_user_id", filter.passenger_user_id);
    }
    if (filter.rider_user_id) {
      query = query.eq("rider_user_id", filter.rider_user_id);
    }
    if (filter.booking_request_ids?.length) {
      query = query.in("booking_request_id", filter.booking_request_ids);
    }
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as Record<string, unknown>[];
  };

  const native = await run(nativeDb, NATIVE_TABLE);
  if (native.length > 0) return native;
  return run(publicDb, PUBLIC_TABLE);
}

export async function loadRideRowById(
  nativeDb: SupabaseClient,
  publicDb: SupabaseClient,
  rideId: string,
  columns = "*",
): Promise<Record<string, unknown> | null> {
  const { data: native, error: nativeErr } = await nativeDb.from(NATIVE_TABLE)
    .select(columns)
    .eq("id", rideId)
    .maybeSingle();
  if (!nativeErr && native) return native as Record<string, unknown>;

  const { data: pub } = await publicDb.from(PUBLIC_TABLE)
    .select(columns)
    .eq("id", rideId)
    .maybeSingle();
  return (pub as Record<string, unknown> | null) ?? null;
}

export async function loadHubActiveRideForUser(
  nativeDb: SupabaseClient,
  publicDb: SupabaseClient,
  getContactsDb: () => Promise<RidesContactsDb>,
  userId: string,
): Promise<{
  ride: Record<string, unknown>;
  participant_role: "booker" | "passenger";
} | null> {
  const statuses = [...ACTIVE_RIDE_STATUSES];

  const [asPassenger, asBooker] = await Promise.all([
    queryRideRequestsList(nativeDb, publicDb, {
      passenger_user_id: userId,
      statuses,
      limit: 10,
    }),
    queryRideRequestsList(nativeDb, publicDb, {
      rider_user_id: userId,
      statuses,
      limit: 10,
    }),
  ]);

  for (const ride of asPassenger) {
    if (isHubDelegatedRide(ride)) {
      return { ride, participant_role: "passenger" };
    }
  }
  for (const ride of asBooker) {
    if (isHubDelegatedRide(ride)) {
      return { ride, participant_role: "booker" };
    }
  }

  try {
    const { db: contactsDb, tables: t } = await getContactsDb();
    const [{ data: requesterIntent }, { data: payerIntent }] = await Promise.all([
      contactsDb.from(t.booking_requests)
        .select("ride_request_id")
        .eq("requester_user_id", userId)
        .in("status", ["booked", "consumed", "claimed"])
        .not("ride_request_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      contactsDb.from(t.booking_requests)
        .select("ride_request_id")
        .eq("claimed_by_user_id", userId)
        .in("status", ["booked", "consumed", "claimed"])
        .not("ride_request_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const requesterRideId = requesterIntent?.ride_request_id
      ? String(requesterIntent.ride_request_id)
      : null;
    if (requesterRideId) {
      const ride = await loadRideRowById(nativeDb, publicDb, requesterRideId);
      if (ride && statuses.includes(String(ride.status))) {
        return { ride, participant_role: "passenger" };
      }
    }

    const payerRideId = payerIntent?.ride_request_id
      ? String(payerIntent.ride_request_id)
      : null;
    if (payerRideId) {
      const ride = await loadRideRowById(nativeDb, publicDb, payerRideId);
      if (ride && statuses.includes(String(ride.status))) {
        return { ride, participant_role: "booker" };
      }
    }
  } catch {
    /* contacts db optional */
  }

  const firstPassenger = asPassenger[0];
  if (firstPassenger && isHubDelegatedRide(firstPassenger)) {
    return { ride: firstPassenger, participant_role: "passenger" };
  }

  const firstBooker = asBooker[0];
  if (firstBooker && isHubDelegatedRide(firstBooker)) {
    return { ride: firstBooker, participant_role: "booker" };
  }

  return null;
}
