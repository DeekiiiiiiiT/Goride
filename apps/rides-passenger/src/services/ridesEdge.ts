import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type {
  CreateRideBody,
  DriverOfferRow,
  FareQuoteResponse,
  RideLiveResponse,
  RideMessageDto,
  RideMessagesResponse,
  RideRequestRow,
  SendRideMessageBody,
  SendRideMessageResponse,
} from '@roam/types/rides';
import type { RidesVehicleTypeDto } from '@/types/vehicleTypes';

async function ridesHeaders(): Promise<HeadersInit> {
  const { data: { user } } = await supabase.auth.getUser();
  let token = user ? (await supabase.auth.getSession()).data.session?.access_token : null;
  if (!token) {
    const refreshed = await supabase.auth.refreshSession();
    token = refreshed.data.session?.access_token ?? null;
  }
  return {
    Authorization: `Bearer ${token ?? publicAnonKey}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

const base = API_ENDPOINTS.rides;

export async function ridesListVehicleTypes(): Promise<{
  services?: RidesVehicleTypeDto[];
  vehicle_types: RidesVehicleTypeDto[];
}> {
  const res = await fetch(`${base}/v1/vehicle-types`, { headers: await ridesHeaders() });
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
  const res = await fetch(`${base}/v1/quote`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesCreateRequest(body: CreateRideBody): Promise<{ ride: RideRequestRow }> {
  const res = await fetch(`${base}/v1/requests`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesGetRequest(id: string): Promise<{
  ride: RideRequestRow;
  offers: DriverOfferRow[];
  wait_time?: Record<string, unknown> | null;
  rider_pin?: string | null;
  can_chat?: boolean;
  participant_role?: 'booker' | 'passenger' | 'driver' | 'none';
}> {
  const res = await fetch(`${base}/v1/requests/${id}`, { headers: await ridesHeaders() });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesGetLive(id: string): Promise<RideLiveResponse> {
  const res = await fetch(`${base}/v1/requests/${id}/live`, { headers: await ridesHeaders() });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesCancelRequest(id: string, reason?: string): Promise<{ ride: RideRequestRow }> {
  const res = await fetch(`${base}/v1/requests/${id}/cancel`, {
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
  const res = await fetch(`${base}/v1/requests/${rideId}/messages${qs ? `?${qs}` : ''}`, {
    headers: await ridesHeaders(),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export async function ridesSendMessage(
  rideId: string,
  body: SendRideMessageBody,
): Promise<SendRideMessageResponse> {
  const res = await fetch(`${base}/v1/requests/${rideId}/messages`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseRidesError(res);
  return res.json();
}

export type { RideMessageDto };
