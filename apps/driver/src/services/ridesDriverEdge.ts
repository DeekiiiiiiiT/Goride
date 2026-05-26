import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '../utils/supabase/client';
import type {
  DriverEarningsPeriod,
  DriverEarningsSummary,
  DriverMyTripsResponse,
  DriverOfferWithRide,
  DriverPresenceBody,
  DriverTransitionBody,
  RideRequestRow,
} from '@roam/types/rides';

async function ridesHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || publicAnonKey;
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

const base = API_ENDPOINTS.rides;

export async function ridesDriverPresence(body: DriverPresenceBody): Promise<void> {
  const res = await fetch(`${base}/v1/drivers/presence`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error === 'fleet_not_eligible_for_dispatch') {
        throw new Error('fleet_not_eligible_for_dispatch');
      }
      if (parsed.error === 'driver_not_active') {
        throw new Error('driver_not_active');
      }
      if (parsed.error === 'no_driver_profile') {
        throw new Error('no_driver_profile');
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'fleet_not_eligible_for_dispatch') throw e;
    }
    throw new Error(text);
  }
}

export async function ridesDriverPendingOffers(): Promise<{ offers: DriverOfferWithRide[] }> {
  const res = await fetch(`${base}/v1/drivers/offers`, { headers: await ridesHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ridesDriverAcceptOffer(offerId: string): Promise<{ ride: RideRequestRow }> {
  const res = await fetch(`${base}/v1/drivers/offers/${offerId}/accept`, {
    method: 'POST',
    headers: await ridesHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ridesDriverDeclineOffer(offerId: string): Promise<void> {
  const res = await fetch(`${base}/v1/drivers/offers/${offerId}/decline`, {
    method: 'POST',
    headers: await ridesHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function ridesDriverGetRequest(id: string): Promise<{
  ride: RideRequestRow;
  offers: DriverOfferWithRide[];
}> {
  const res = await fetch(`${base}/v1/requests/${id}`, { headers: await ridesHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ridesDriverTransition(id: string, body: DriverTransitionBody): Promise<{ ride: RideRequestRow }> {
  const res = await fetch(`${base}/v1/requests/${id}/driver-transition`, {
    method: 'PATCH',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ridesDriverMyTrips(
  opts: { page?: number; limit?: number } = {},
): Promise<DriverMyTripsResponse> {
  const sp = new URLSearchParams();
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  const qs = sp.toString();
  const res = await fetch(`${base}/v1/drivers/me/trips${qs ? `?${qs}` : ''}`, {
    headers: await ridesHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ridesDriverMyEarnings(
  period: DriverEarningsPeriod,
): Promise<DriverEarningsSummary> {
  const res = await fetch(`${base}/v1/drivers/me/earnings?period=${encodeURIComponent(period)}`, {
    headers: await ridesHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
