import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { withTimeout } from '@/lib/withTimeout';
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
import {
  tripIntentGetBookerView,
  tripIntentGetMyActive,
  tripIntentGetTargetingMe,
  tripIntentWithdraw,
} from '@/services/tripIntentEdge';
import { readAnyActiveRideId, readRiderRideCache } from '@/utils/riderActiveRideSession';

const base = API_ENDPOINTS.rides;

const HUB_INTENT_STATUSES = new Set(['draft', 'published', 'claimed', 'booked', 'pending']);

async function headers(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  let token = session?.access_token ?? null;
  if (!token) {
    const refreshed = await withTimeout(
      supabase.auth.refreshSession(),
      12_000,
      'Session refresh timed out — sign in again.',
    );
    token = refreshed.data.session?.access_token ?? null;
  }
  return {
    Authorization: `Bearer ${token ?? publicAnonKey}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

const TERMINAL_RIDE_STATUSES = new Set(['cancelled', 'completed']);

function isLiveHubRide(ride: ActiveRideResponse['ride']): boolean {
  return Boolean(ride && !TERMINAL_RIDE_STATUSES.has(ride.status));
}

/** Same source as the live ride tracker — with session cache fallback. */
export async function resolveActiveRideForHub(): Promise<ActiveRideResponse | null> {
  try {
    const active = await ridesGetMyActiveRide();
    if (active?.ride && isLiveHubRide(active.ride)) return active;
  } catch {
    /* fall through */
  }

  const cachedId = readAnyActiveRideId();
  if (!cachedId) return null;

  try {
    const res = await ridesGetRequest(cachedId);
    if (!isLiveHubRide(res.ride)) return null;
    const role = res.participant_role;
    if (role !== 'booker' && role !== 'passenger') return null;
    return {
      ride: res.ride,
      participant_role: role,
      is_delegated: res.is_delegated ?? true,
    };
  } catch {
    const cached = readRiderRideCache(cachedId);
    if (!cached?.ride || !isLiveHubRide(cached.ride)) return null;
    return {
      ride: cached.ride,
      participant_role: 'passenger',
      is_delegated: true,
    };
  }
}

function injectActiveRideIntoHub(
  merged: BookForOthersActivityResponse,
  activeRide: ActiveRideResponse | null,
): BookForOthersActivityResponse {
  if (!activeRide?.ride || !isLiveHubRide(activeRide.ride)) return merged;

  const next = {
    book_for_someone: [...merged.book_for_someone],
    book_for_me: [...merged.book_for_me],
  };

  if (activeRide.participant_role === 'booker') {
    const item = rideToSomeoneItem(activeRide.ride);
    if (!next.book_for_someone.some((entry) => entry.kind === 'ride' && entry.ride_id === item.ride_id)) {
      next.book_for_someone.unshift(item);
    }
  } else if (activeRide.participant_role === 'passenger') {
    const item = rideToMeItem(activeRide.ride);
    if (!next.book_for_me.some((entry) => entry.kind === 'ride' && entry.ride_id === item.ride_id)) {
      next.book_for_me.unshift(item);
    }
  }

  return {
    book_for_someone: sortSomeoneItems(next.book_for_someone),
    book_for_me: sortMeItems(next.book_for_me),
  };
}

async function bookForOthersGetActivityFromApi(): Promise<BookForOthersActivityResponse | null> {
  const res = await fetch(`${base}/v1/book-for-others/activity`, { headers: await headers() });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[book-for-others] activity API failed', res.status, errText);
    if (res.status === 403) {
      throw new Error('Active trips blocked — your account role cannot load payer trips. Sign out and back in, or contact support.');
    }
    throw new Error(`Active trips failed to load (${res.status})`);
  }
  return res.json() as Promise<BookForOthersActivityResponse>;
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
    committed_at: row.committed_at ?? null,
    book_by_at: row.book_by_at ?? null,
    can_book: row.can_book ?? false,
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

  if (activeRide?.ride && isLiveHubRide(activeRide.ride)) {
    if (activeRide.participant_role === 'booker') {
      const item = rideToSomeoneItem(activeRide.ride);
      if (!bookForSomeone.some((entry) => entry.kind === 'ride' && entry.ride_id === item.ride_id)) {
        bookForSomeone.unshift(item);
      }
    } else if (activeRide.participant_role === 'passenger') {
      const item = rideToMeItem(activeRide.ride);
      if (!bookForMe.some((entry) => entry.kind === 'ride' && entry.ride_id === item.ride_id)) {
        bookForMe.unshift(item);
      }
    }
  }

  return {
    book_for_someone: sortSomeoneItems(bookForSomeone),
    book_for_me: sortMeItems(bookForMe),
  };
}

type HubRideItem = BookForOthersRideActivityItem;
type HubSomeoneItem = BookForOthersSomeoneActivityItem;
type HubMeItem = BookForOthersMeActivityItem;

/** Prefer live ride rows over booked trip-intent rows so riders/bookers can open the tracker. */
async function promoteBookedIntentsToRides<T extends HubSomeoneItem | HubMeItem>(
  items: T[],
  counterpartyFromIntent: (item: BookForOthersIntentActivityItem) => string | null,
): Promise<T[]> {
  const promoted: T[] = [];

  for (const item of items) {
    if (item.kind !== 'trip_intent' || item.status !== 'booked' || !item.ride_request_id) {
      promoted.push(item);
      continue;
    }

    try {
      const res = await ridesGetRequest(item.ride_request_id);
      if (res.ride.status === 'cancelled' || res.ride.status === 'completed') continue;
      const rideItem: HubRideItem = {
        kind: 'ride',
        ride_id: res.ride.id,
        status: res.ride.status,
        roam_mode: res.ride.roam_mode ?? 'open_roam',
        counterparty_name: counterpartyFromIntent(item),
        pickup_address: res.ride.pickup_address ?? null,
        dropoff_address: res.ride.dropoff_address ?? null,
        created_at: res.ride.created_at,
      };
      promoted.push(rideItem as T);
    } catch {
      promoted.push(item);
    }
  }

  const seenRideIds = new Set<string>();
  return promoted.filter((entry) => {
    if (entry.kind !== 'ride') return true;
    if (seenRideIds.has(entry.ride_id)) return false;
    seenRideIds.add(entry.ride_id);
    return true;
  });
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

/** Drops payer intents whose linked ride ended or were cancelled server-side. */
async function reconcileStaleSomeoneIntents(
  items: BookForOthersSomeoneActivityItem[],
): Promise<BookForOthersSomeoneActivityItem[]> {
  const kept: BookForOthersSomeoneActivityItem[] = [];

  for (const item of items) {
    if (item.kind !== 'trip_intent') {
      kept.push(item);
      continue;
    }

    if (item.status === 'booked' && item.ride_request_id) {
      let linkedStatus = item.linked_ride_status ?? null;
      if (!linkedStatus) {
        try {
          const res = await ridesGetRequest(item.ride_request_id);
          linkedStatus = res.ride.status;
        } catch {
          kept.push(item);
          continue;
        }
      }
      if (linkedStatus === 'cancelled' || linkedStatus === 'completed') continue;
      kept.push(
        linkedStatus
          ? { ...item, linked_ride_status: linkedStatus }
          : item,
      );
      continue;
    }

    if (item.status === 'claimed') {
      try {
        const res = await tripIntentGetBookerView(item.intent_id);
        const status = res.trip_intent.status;
        if (status === 'cancelled' || status === 'expired' || status === 'consumed') continue;
        kept.push(item);
      } catch {
        continue;
      }
      continue;
    }

    kept.push(item);
  }

  return kept;
}

/** Loads hub activity — active ride tracker is the primary source of truth. */
export async function loadBookForOthersActivity(): Promise<BookForOthersActivityResponse> {
  const activeRide = await resolveActiveRideForHub();
  let hub = injectActiveRideIntoHub(
    { book_for_someone: [], book_for_me: [] },
    activeRide,
  );

  const [apiResult, intentResult, targetingResult] = await Promise.allSettled([
    bookForOthersGetActivityFromApi(),
    tripIntentGetMyActive(),
    tripIntentGetTargetingMe(),
  ]);

  const fromApi = apiResult.status === 'fulfilled' ? apiResult.value : null;
  const intent =
    intentResult.status === 'fulfilled' ? intentResult.value.trip_intent : null;
  const targetingIntents =
    targetingResult.status === 'fulfilled' ? targetingResult.value.trip_intents : [];

  if (apiResult.status === 'rejected') {
    console.warn('[book-for-others] activity API error', apiResult.reason);
  }
  if (targetingResult.status === 'rejected') {
    console.warn('[book-for-others] targeting-me error', targetingResult.reason);
  }

  hub = mergeBookForOthersActivity(fromApi, intent, targetingIntents, activeRide);
  hub.book_for_me = await promoteBookedIntentsToRides(hub.book_for_me, () => null);
  hub.book_for_someone = await promoteBookedIntentsToRides(
    hub.book_for_someone,
    (item) => item.requester_name?.trim() ?? null,
  );
  hub.book_for_me = await reconcileStaleMeIntents(hub.book_for_me);
  hub.book_for_someone = await reconcileStaleSomeoneIntents(hub.book_for_someone);

  const activeAgain = activeRide ?? await resolveActiveRideForHub();
  const result = injectActiveRideIntoHub(hub, activeAgain);

  if (
    result.book_for_someone.length === 0
    && apiResult.status === 'rejected'
    && targetingResult.status === 'rejected'
  ) {
    const reason = apiResult.reason instanceof Error ? apiResult.reason : new Error(String(apiResult.reason));
    throw reason;
  }

  return result;
}
