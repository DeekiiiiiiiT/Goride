import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { withTimeout } from '@/lib/withTimeout';
import type {
  ActiveRideResponse,
  ActiveRideSummaryResponse,
  CreateRideBody,
  DriverOfferRow,
  FareQuoteResponse,
  RideLiveResponse,
  RideMessageDto,
  RideMessagesResponse,
  RideRequestRow,
  ScheduledRideCreateBody,
  ScheduledRideDetailResponse,
  ScheduledRideListResponse,
  ScheduledRideQuoteBody,
  SendRideMessageBody,
  SendRideMessageResponse,
  SettlementSummaryDto,
} from '@roam/types/rides';
import type { RidesVehicleTypeDto } from '@/types/vehicleTypes';

const base = API_ENDPOINTS.rides;
const RIDES_FETCH_TIMEOUT_MS = 25_000;

async function ridesFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RIDES_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Request timed out — check your connection and try again.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function ridesHeaders(): Promise<HeadersInit> {
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

export async function ridesListVehicleTypes(): Promise<{
  services?: RidesVehicleTypeDto[];
  vehicle_types: RidesVehicleTypeDto[];
}> {
  const res = await ridesFetch(`${base}/v1/vehicle-types`, { headers: await ridesHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

type RidesErrorBody = {
  error?: string;
  message?: string;
  allowed?: string[];
  vehicle_type?: string;
  location_keys_tried?: string[];
  vehicle_types_tried?: string[];
};

function throwRidesErrorBody(body: RidesErrorBody, status: number, rawText: string): never {
  if (body.error === 'quote_stale') {
    throw new Error('Price expired — tap Fare estimate to refresh.');
  }
  if (body.error === 'feature_disabled') {
    throw new Error('Scheduled rides are not available yet.');
  }
  if (body.error === 'scheduled_too_soon') {
    throw new Error('Pick a time at least 30 minutes from now.');
  }
  if (body.error === 'scheduled_too_far') {
    throw new Error('Scheduled rides can be booked up to 7 days ahead.');
  }
  if (body.error === 'too_many_scheduled_rides') {
    throw new Error('You have too many upcoming scheduled rides. Cancel one to book another.');
  }
  if (body.error === 'Unauthorized' || status === 401) {
    throw new Error('Session expired — sign in again to book.');
  }
  if (body.error === 'rider_account_restricted') {
    throw new Error('Your account cannot book rides right now. Contact support.');
  }
  if (body.error === 'insert_failed') {
    throw new Error('Could not start your trip. Please try again in a moment.');
  }
  if (body.error === 'invalid_guest_passenger') {
    throw new Error('Enter the recipient’s name and phone number to book for someone else.');
  }
  if (body.error === 'not_found') {
    throw new Error('Ride not found. It may still be syncing — go back and try again.');
  }
  if (body.error === 'chat_not_available') {
    throw new Error('Chat is only available during an active trip.');
  }
  if (body.error === 'update_failed') {
    throw new Error(
      body.message ??
        'Could not cancel ride. The server database patch may be missing — contact support.',
    );
  }
  if (body.error === 'no_fare_rule') {
    const svc = body.vehicle_type ? `"${body.vehicle_type}"` : 'this service';
    const triedLocs = body.location_keys_tried?.length
      ? ` Locations tried: ${body.location_keys_tried.join(' → ')}.`
      : '';
    const triedSlugs = body.vehicle_types_tried?.length
      ? ` Service IDs tried: ${body.vehicle_types_tried.join(', ')}.`
      : '';
    throw new Error(
      body.message ??
        `No active fare rule for ${svc}.${triedLocs}${triedSlugs} Add All Jamaica + that service in Fare Rules; service ID must match Transport Solutions.`,
    );
  }
  if (body.error === 'unknown_service') {
    const list = body.allowed?.length ? body.allowed.join(', ') : '';
    throw new Error(
      list
        ? `Unknown service. Active: ${list}`
        : 'Unknown service — pick Roam S, Comfort, etc.',
    );
  }
  if (body.message) throw new Error(body.message);
  if (body.error) throw new Error(`${body.error} (HTTP ${status})`);
  throw new Error(rawText.trim() || `HTTP ${status}`);
}

async function parseRidesError(res: Response): Promise<never> {
  const text = await res.text();
  let body: RidesErrorBody = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text) as RidesErrorBody;
    } catch {
      const snippet = text.trim().slice(0, 180);
      throw new Error(
        snippet.startsWith('<')
          ? 'Rides API returned HTML — redeploy the rides Edge function or check Supabase URL.'
          : snippet || `Request failed (HTTP ${res.status})`,
      );
    }
  }
  throwRidesErrorBody(body, res.status, text);
}

export async function ridesQuote(body: {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  vehicle_option?: string;
}): Promise<FareQuoteResponse> {
  const res = await ridesFetch(`${base}/v1/quote`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesCreateRequest(body: CreateRideBody): Promise<{ ride: RideRequestRow }> {
  const res = await ridesFetch(`${base}/v1/requests`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesScheduledQuote(
  body: ScheduledRideQuoteBody,
): Promise<FareQuoteResponse & { scheduled_pickup_at: string }> {
  const res = await ridesFetch(`${base}/v1/scheduled-rides/quote`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesCreateScheduled(
  body: ScheduledRideCreateBody,
): Promise<ScheduledRideDetailResponse> {
  const res = await ridesFetch(`${base}/v1/scheduled-rides`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesListScheduled(): Promise<ScheduledRideListResponse> {
  const res = await ridesFetch(`${base}/v1/scheduled-rides`, { headers: await ridesHeaders() });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesGetScheduled(id: string): Promise<ScheduledRideDetailResponse> {
  const res = await ridesFetch(`${base}/v1/scheduled-rides/${id}`, { headers: await ridesHeaders() });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesCancelScheduled(id: string): Promise<{ ride: RideRequestRow }> {
  const res = await ridesFetch(`${base}/v1/scheduled-rides/${id}/cancel`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesGetMyActiveRide(): Promise<ActiveRideResponse> {
  const res = await ridesFetch(`${base}/v1/requests/me/active`, { headers: await ridesHeaders() });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesGetMyActiveRideSummary(): Promise<ActiveRideSummaryResponse> {
  const res = await ridesFetch(`${base}/v1/requests/me/active?summary=1`, {
    headers: await ridesHeaders(),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesGetRequest(id: string): Promise<{
  ride: RideRequestRow;
  offers: DriverOfferRow[];
  wait_time?: Record<string, unknown> | null;
  rider_pin?: string | null;
  pin_enabled?: boolean;
  can_chat?: boolean;
  can_cancel?: boolean;
  is_delegated?: boolean;
  participant_role?: 'booker' | 'passenger' | 'driver' | 'none';
  booker_visibility?: 'shadow' | 'open';
  roam_mode?: 'open_roam' | 'shadow_roam' | null;
  assigned_driver?: import('@roam/types/delegatedRide').AssignedDriverSummaryDto | null;
}> {
  const res = await ridesFetch(`${base}/v1/requests/${id}`, { headers: await ridesHeaders() });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesGetLive(id: string): Promise<RideLiveResponse> {
  const res = await ridesFetch(`${base}/v1/requests/${id}/live`, { headers: await ridesHeaders() });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesCancelRequest(id: string, reason?: string): Promise<{ ride: RideRequestRow }> {
  const res = await ridesFetch(`${base}/v1/requests/${id}/cancel`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesListMessages(
  rideId: string,
  opts?: { limit?: number; before?: string },
): Promise<RideMessagesResponse> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.before) params.set('before', opts.before);
  const qs = params.toString();
  const res = await ridesFetch(`${base}/v1/requests/${rideId}/messages${qs ? `?${qs}` : ''}`, {
    headers: await ridesHeaders(),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesSendMessage(
  rideId: string,
  body: SendRideMessageBody,
): Promise<SendRideMessageResponse> {
  const res = await ridesFetch(`${base}/v1/requests/${rideId}/messages`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesGetSettlementSummary(
  rideId: string,
): Promise<{ summary: SettlementSummaryDto }> {
  const res = await ridesFetch(`${base}/v1/requests/${rideId}/settlement-summary`, {
    headers: await ridesHeaders(),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export type { RideMessageDto };
