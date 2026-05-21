import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type {
  CreateRideBody,
  DriverOfferRow,
  FareQuoteResponse,
  RideRequestRow,
} from '@roam/types/rides';
import type { RidesVehicleTypeDto } from '@/types/vehicleTypes';

async function ridesHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? publicAnonKey;
  return {
    Authorization: `Bearer ${token}`,
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
  if (body.error) throw new Error(`${body.error} (HTTP ${res.status})`);
  throw new Error(text.trim() || `HTTP ${res.status}`);
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
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error === 'quote_stale') {
        throw new Error('Price expired — tap Fare estimate to refresh.');
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('Price expired')) throw e;
    }
    throw new Error(text);
  }
  return res.json();
}

export async function ridesGetRequest(id: string): Promise<{
  ride: RideRequestRow;
  offers: DriverOfferRow[];
}> {
  const res = await fetch(`${base}/v1/requests/${id}`, { headers: await ridesHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ridesCancelRequest(id: string, reason?: string): Promise<{ ride: RideRequestRow }> {
  const res = await fetch(`${base}/v1/requests/${id}/cancel`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
