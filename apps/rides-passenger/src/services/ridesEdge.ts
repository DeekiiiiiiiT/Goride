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
  if (!res.ok) throw new Error(await res.text());
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
