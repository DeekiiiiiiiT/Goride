import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '../utils/supabase/client';
import type {
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
