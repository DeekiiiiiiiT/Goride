import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type { ActiveRideResponse } from '@roam/types/rides';
import type {
  BookForOthersActivityResponse,
  BookForOthersIntentActivityItem,
  BookForOthersMeActivityItem,
  BookForOthersRideActivityItem,
  BookForOthersSomeoneActivityItem,
  TripIntentRow,
} from '@roam/types/riderContacts';
import { ridesGetMyActiveRide, ridesGetRequest } from '@/services/ridesEdge';
import { tripIntentGetMyActive, tripIntentGetTargetingMe, tripIntentWithdraw } from '@/services/tripIntentEdge';

const base = API_ENDPOINTS.rides;

const HUB_INTENT_STATUSES = new Set(['draft', 'published', 'claimed', 'booked', 'pending']);

async function headers(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? publicAnonKey;
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

async function bookForOthersGetActivityFromApi(): Promise<BookForOthersActivityResponse | null> {
  const res = await fetch(`${base}/v1/book-for-others/activity`, { headers: await headers() });
  if (!res.ok) return null;
  return res.json();
}

function intentToActivityItem(
  row: TripIntentRow,
  role: 'requester' | 'target_booker' = 'requester',
): BookForOthersIntentActivityItem {
  return {
    kind: 'trip_intent',
    intent_id: row.id,
    status: row.status,
    roam_mode: row.roam_mode ?? 'open_roam',
    pickup_address: row.pickup_address,
    dropoff_address: row.dropoff_address,
    fare_estimate_minor: row.fare_estimate_minor ?? null,
    currency: row.currency ?? null,
    created_at: row.created_at,
    requester_name: row.requester_name,
    intent_role: role,
    ride_request_id: row.ride_request_id ?? null,
    can_cancel: role === 'requester',
  };
}

function rideToSomeoneItem(ride: NonNullable<ActiveRideResponse['ride']>): BookForOthersRideActivityItem {
  return {
    kind: 'ride',
    ride_id: ride.id,
    status: ride.status,
    roam_mode: ride.roam_mode ?? 'open_roam',
    counterparty_name: ride.guest_passenger_name ?? null,
    pickup_address: ride.pickup_address ?? null,
    dropoff_address: ride.dropoff_address ?? null,
    created_at: ride.created_at,
  };
}

function rideToMeItem(ride: NonNullable<ActiveRideResponse['ride']>): BookForOthersRideActivityItem {
  return {
    kind: 'ride',
    ride_id: ride.id,
    status: ride.status,
    roam_mode: ride.roam_mode ?? 'open_roam',
    counterparty_name: null,
    pickup_address: ride.pickup_address ?? null,
    dropoff_address: ride.dropoff_address ?? null,
    created_at: ride.created_at,
  };
}

function sortMeItems(items: BookForOthersMeActivityItem[]): BookForOthersMeActivityItem[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function sortSomeoneItems(items: BookForOthersSomeoneActivityItem[]): BookForOthersSomeoneActivityItem[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function mergeBookForOthersActivity(
  fromApi: BookForOthersActivityResponse | null,
  intent: TripIntentRow | null,
  targetingIntents: BookForOthersIntentActivityItem[],
  activeRide: ActiveRideResponse | null,
): BookForOthersActivityResponse {
  let bookForSomeone: BookForOthersSomeoneActivityItem[] = [...(fromApi?.book_for_someone ?? [])];
  let bookForMe = [...(fromApi?.book_for_me ?? [])];

  const linkedIntentId =
    activeRide?.ride?.booking_request_id && typeof activeRide.ride.booking_request_id === 'string'
      ? activeRide.ride.booking_request_id
      : null;

  if (intent && HUB_INTENT_STATUSES.has(intent.status)) {
    const item = intentToActivityItem(intent, 'requester');
    const alreadyListed = bookForMe.some(
      (entry) => entry.kind === 'trip_intent' && entry.intent_id === item.intent_id,
    );
    if (!alreadyListed && linkedIntentId !== intent.id) {
      bookForMe = [item, ...bookForMe];
    }
  }

  for (const item of targetingIntents) {
    const alreadyListed = bookForSomeone.some(
      (entry) => entry.kind === 'trip_intent' && entry.intent_id === item.intent_id,
    );
    const rideCoversIntent =
      activeRide?.ride?.booking_request_id === item.intent_id
      && activeRide.participant_role === 'booker'
      && activeRide.is_delegated;
    if (!alreadyListed && !rideCoversIntent) {
      bookForSomeone = [item, ...bookForSomeone];
    }
  }

  if (activeRide?.ride && activeRide.participant_role === 'booker' && activeRide.is_delegated) {
    const item = rideToSomeoneItem(activeRide.ride);
    if (!bookForSomeone.some((entry) => entry.kind === 'ride' && entry.ride_id === item.ride_id)) {
      bookForSomeone.unshift(item);
    }
  }

  if (activeRide?.ride && activeRide.participant_role === 'passenger') {
    const item = rideToMeItem(activeRide.ride);
    if (!bookForMe.some((entry) => entry.kind === 'ride' && entry.ride_id === item.ride_id)) {
      bookForMe.push(item);
    }
  }

  return {
    book_for_someone: sortSomeoneItems(bookForSomeone),
    book_for_me: sortMeItems(bookForMe),
  };
}

/** Drops or auto-clears booked intents whose linked ride already ended. */
async function reconcileStaleMeIntents(
  items: BookForOthersMeActivityItem[],
): Promise<BookForOthersMeActivityItem[]> {
  const bookedIntents = items.filter(
    (item): item is BookForOthersIntentActivityItem =>
      item.kind === 'trip_intent'
      && item.status === 'booked'
      && Boolean(item.ride_request_id),
  );

  const rideStatusById = new Map<string, string>();
  await Promise.all(
    bookedIntents.map(async (item) => {
      const rideId = item.ride_request_id!;
      if (item.linked_ride_status) {
        rideStatusById.set(rideId, item.linked_ride_status);
        return;
      }
      try {
        const res = await ridesGetRequest(rideId);
        rideStatusById.set(rideId, res.ride.status);
      } catch {
        /* keep item if ride lookup fails */
      }
    }),
  );

  const kept: BookForOthersMeActivityItem[] = [];
  for (const item of items) {
    if (item.kind !== 'trip_intent' || item.status !== 'booked' || !item.ride_request_id) {
      kept.push(item);
      continue;
    }

    const linkedStatus = item.linked_ride_status ?? rideStatusById.get(item.ride_request_id) ?? null;
    if (linkedStatus === 'cancelled') {
      try {
        await tripIntentWithdraw(item.intent_id);
      } catch {
        kept.push({
          ...item,
          linked_ride_status: 'cancelled',
          can_cancel: true,
        });
      }
      continue;
    }
    if (linkedStatus === 'completed') continue;

    kept.push(
      linkedStatus
        ? { ...item, linked_ride_status: linkedStatus, can_cancel: item.can_cancel ?? true }
        : item,
    );
  }

  return kept;
}

/** Loads hub activity from the list API plus live trip-intent / active-ride endpoints. */
export async function loadBookForOthersActivity(): Promise<BookForOthersActivityResponse> {
  const [apiResult, intentResult, targetingResult, rideResult] = await Promise.allSettled([
    bookForOthersGetActivityFromApi(),
    tripIntentGetMyActive(),
    tripIntentGetTargetingMe(),
    ridesGetMyActiveRide(),
  ]);

  const fromApi = apiResult.status === 'fulfilled' ? apiResult.value : null;
  const intent =
    intentResult.status === 'fulfilled' ? intentResult.value.trip_intent : null;
  const targetingIntents =
    targetingResult.status === 'fulfilled' ? targetingResult.value.trip_intents : [];
  const activeRide = rideResult.status === 'fulfilled' ? rideResult.value : null;

  const merged = mergeBookForOthersActivity(fromApi, intent, targetingIntents, activeRide);
  merged.book_for_me = await reconcileStaleMeIntents(merged.book_for_me);
  return merged;
}
