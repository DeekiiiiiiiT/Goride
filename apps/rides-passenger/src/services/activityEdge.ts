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

function isActivityTripHistoryItem(value: unknown): value is ActivityTripHistoryItem {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.kind === 'ride'
    && typeof row.ride_id === 'string'
    && (row.status === 'completed' || row.status === 'cancelled')
    && (row.roam_mode === 'open_roam' || row.roam_mode === 'shadow_roam')
    && (row.participant_role === 'booker' || row.participant_role === 'passenger')
    && (row.trip_category === 'for_others' || row.trip_category === 'for_me' || row.trip_category === 'self')
    && typeof row.created_at === 'string'
    && typeof row.ended_at === 'string';
}

function parseActivityTripsResponse(payload: unknown): ActivityTripsResponse {
  if (!payload || typeof payload !== 'object') {
    return { trips: [], next_cursor: null, window_days: ACTIVITY_HISTORY_WINDOW_DAYS };
  }
  const body = payload as Record<string, unknown>;
  const rawTrips = Array.isArray(body.trips) ? body.trips : [];
  const trips = rawTrips.filter(isActivityTripHistoryItem);
  if (trips.length !== rawTrips.length && !parseWarned) {
    parseWarned = true;
    console.warn('[activity] dropped invalid trip rows from API response');
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
    throw new Error(`Activity failed to load (${res.status})`);
  }
  const json = await res.json();
  return parseActivityTripsResponse(json);
}
