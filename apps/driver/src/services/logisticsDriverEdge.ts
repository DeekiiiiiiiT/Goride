import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import type { DriverOfferWithRide } from '@roam/types/rides';
import { supabase } from '../utils/supabase/client';

async function logisticsHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

function mapLogisticsOffer(raw: Record<string, unknown>): DriverOfferWithRide {
  const job = (raw.job ?? null) as Record<string, unknown> | null;
  return {
    id: String(raw.id),
    ride_request_id: String(raw.job_id),
    driver_user_id: String(raw.driver_user_id),
    status: raw.status as DriverOfferWithRide['status'],
    wave: Number(raw.wave ?? 1),
    rank_score: raw.rank_score != null ? Number(raw.rank_score) : null,
    distance_km: raw.distance_km != null ? Number(raw.distance_km) : null,
    expires_at: String(raw.expires_at),
    created_at: String(raw.created_at),
    offer_kind: 'logistics_job',
    ride: job
      ? {
          id: String(job.id),
          pickup_address: job.pickup_label != null ? String(job.pickup_label) : null,
          dropoff_address: job.dropoff_label != null ? String(job.dropoff_label) : null,
          fare_estimate_minor: 0,
          currency: 'JMD',
          distance_estimate_km: null,
          vehicle_option: 'enterprise_freight',
          surge_multiplier: 1,
          guest_passenger_name: job.reference_code
            ? `Freight ${String(job.reference_code)}`
            : 'Freight job',
        }
      : null,
  };
}

export async function logisticsDriverPendingOffers(): Promise<{ offers: DriverOfferWithRide[] }> {
  const res = await fetch(`${API_ENDPOINTS.logistics}/v1/drivers/offers`, {
    headers: await logisticsHeaders(),
  });
  if (!res.ok) {
    // Drivers without enterprise offers should not hard-fail the ride poll
    if (res.status === 401 || res.status === 403) return { offers: [] };
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  const json = (await res.json()) as { offers?: Record<string, unknown>[] };
  return { offers: (json.offers ?? []).map(mapLogisticsOffer) };
}

export async function logisticsDriverAcceptOffer(offerId: string): Promise<{ job_id?: string }> {
  const res = await fetch(`${API_ENDPOINTS.logistics}/v1/drivers/offers/${offerId}/accept`, {
    method: 'POST',
    headers: await logisticsHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof json.error === 'string' ? json.error : res.statusText);
  }
  return json as { job_id?: string };
}

export async function logisticsDriverDeclineOffer(offerId: string): Promise<void> {
  const res = await fetch(`${API_ENDPOINTS.logistics}/v1/drivers/offers/${offerId}/decline`, {
    method: 'POST',
    headers: await logisticsHeaders(),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(typeof json.error === 'string' ? json.error : res.statusText);
  }
}
