import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { withTimeout } from '@/lib/withTimeout';
import type {
  ActivityPipelineItem,
  ActivityTripHistoryItem,
  ActivityTripsResponse,
  ActivityUpcomingResponse,
} from '@roam/types/rides';

export const ACTIVITY_HISTORY_WINDOW_DAYS = 5;

const base = API_ENDPOINTS.rides;

let parseWarned = false;

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

function normalizeActivityTrip(row: unknown): ActivityTripHistoryItem | null {
  if (!row || typeof row !== 'object') return null;
  const raw = row as Record<string, unknown>;
  const rideId = typeof raw.ride_id === 'string' ? raw.ride_id : null;
  const status = raw.status === 'completed' || raw.status === 'cancelled' ? raw.status : null;
  if (!rideId || !status) return null;

  const roamMode = raw.roam_mode === 'shadow_roam' ? 'shadow_roam' : 'open_roam';
  const participantRole = raw.participant_role === 'passenger' ? 'passenger' : 'booker';
  const tripCategory = raw.trip_category === 'for_others' || raw.trip_category === 'for_me'
    ? raw.trip_category
    : 'self';

  const createdAt = typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString();
  const endedAt = typeof raw.ended_at === 'string'
    ? raw.ended_at
    : createdAt;

  return {
    kind: 'ride',
    ride_id: rideId,
    status,
    roam_mode: roamMode,
    participant_role: participantRole,
    trip_category: tripCategory,
    counterparty_name: typeof raw.counterparty_name === 'string' ? raw.counterparty_name : null,
    pickup_address: typeof raw.pickup_address === 'string' ? raw.pickup_address : null,
    dropoff_address: typeof raw.dropoff_address === 'string' ? raw.dropoff_address : null,
    fare_estimate_minor: raw.fare_estimate_minor != null ? String(raw.fare_estimate_minor) : null,
    currency: typeof raw.currency === 'string' ? raw.currency : null,
    created_at: createdAt,
    ended_at: endedAt,
  };
}

function parseActivityTripsResponse(payload: unknown): ActivityTripsResponse {
  if (!payload || typeof payload !== 'object') {
    return { trips: [], next_cursor: null, window_days: ACTIVITY_HISTORY_WINDOW_DAYS };
  }
  const body = payload as Record<string, unknown>;
  if (body.error && !Array.isArray(body.trips)) {
    console.warn('[activity] API error payload', body.error);
    return { trips: [], next_cursor: null, window_days: ACTIVITY_HISTORY_WINDOW_DAYS };
  }
  const rawTrips = Array.isArray(body.trips) ? body.trips : [];
  const trips = rawTrips
    .map(normalizeActivityTrip)
    .filter((trip): trip is ActivityTripHistoryItem => trip != null);
  if (trips.length !== rawTrips.length && !parseWarned) {
    parseWarned = true;
    console.warn('[activity] dropped invalid trip rows from API response', {
      raw: rawTrips.length,
      kept: trips.length,
    });
  }
  const next_cursor = typeof body.next_cursor === 'string' ? body.next_cursor : null;
  const window_days = typeof body.window_days === 'number' ? body.window_days : ACTIVITY_HISTORY_WINDOW_DAYS;
  return { trips, next_cursor, window_days };
}

function isActivityPipelineItem(value: unknown): value is ActivityPipelineItem {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (row.kind === 'schedule' || row.kind === 'courier' || row.kind === 'event')
    && typeof row.id === 'string'
    && typeof row.title === 'string'
    && typeof row.status === 'string'
    && Array.isArray(row.detail_lines);
}

export async function activityUpcomingList(): Promise<ActivityUpcomingResponse> {
  const res = await fetch(`${base}/v1/activity/upcoming`, { headers: await headers() });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[activity] upcoming API failed', res.status, errText);
    if (res.status === 403) {
      throw new Error('Upcoming activity is unavailable for this account role.');
    }
    throw new Error(`Upcoming activity failed to load (${res.status})`);
  }
  const json = await res.json() as Record<string, unknown>;
  const raw = Array.isArray(json.items) ? json.items : [];
  return { items: raw.filter(isActivityPipelineItem) };
}

export async function activityTripsList(options?: {
  limit?: number;
  cursor?: string | null;
}): Promise<ActivityTripsResponse> {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  params.set('days', String(ACTIVITY_HISTORY_WINDOW_DAYS));
  const qs = params.toString();
  const url = `${base}/v1/activity/trips${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: await headers() });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[activity] trips API failed', res.status, errText);
    if (res.status === 403) {
      throw new Error('Activity is unavailable for this account role.');
    }
    if (res.status === 404) {
      throw new Error('Activity API not found — redeploy the rides edge function.');
    }
    throw new Error(`Activity failed to load (${res.status})`);
  }
  const json = await res.json();
  return parseActivityTripsResponse(json);
}
