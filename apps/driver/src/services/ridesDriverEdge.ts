import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '../utils/supabase/client';
import type {
  DriverActiveRideResponse,
  DriverEarningsPeriod,
  DriverEarningsSummary,
  DriverMyTripsResponse,
  DriverOfferWithRide,
  DriverPresenceBody,
  DriverTransitionBody,
  RideLocationUpdateBody,
  RideMessageDto,
  RideMessagesResponse,
  RideRequestRow,
  SendRideMessageBody,
  SendRideMessageResponse,
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

export async function ridesDriverActiveRide(): Promise<DriverActiveRideResponse> {
  const res = await fetch(`${base}/v1/drivers/me/active-ride`, { headers: await ridesHeaders() });
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

export type DriverWaitTimeInfo = {
  wait_time_charge_enabled?: boolean;
  wait_time_grace_remaining_seconds?: number;
  wait_time_grace_expired?: boolean;
  wait_time_current_fee_minor?: number;
  wait_time_billable_minutes?: number;
  wait_time_rate_per_min_minor?: number;
};

export async function ridesDriverGetRequest(id: string): Promise<{
  ride: RideRequestRow;
  offers: DriverOfferWithRide[];
  wait_time?: DriverWaitTimeInfo | null;
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
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      if (parsed.error?.startsWith('pin_')) {
        throw new Error(parsed.message ?? 'Incorrect PIN. Ask the rider for their 4-digit code.');
      }
      throw new Error(parsed.message ?? parsed.error ?? text);
    } catch (e) {
      if (e instanceof Error && e.message !== text) throw e;
      throw new Error(text || 'Transition failed');
    }
  }
  return res.json();
}

export type DriverRideLocationLive = {
  distance_to_pickup_m?: number;
  distance_to_dropoff_m?: number;
  transition_applied?: RideRequestRow['status'] | null;
  complete_suggested?: boolean;
};

export async function ridesDriverPostRideLocation(
  body: RideLocationUpdateBody,
): Promise<{ ok: boolean; ride?: RideRequestRow; live?: DriverRideLocationLive }> {
  const res = await fetch(`${base}/v1/drivers/ride-location`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    throw new Error('rate_limited');
  }
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

async function parseDriverRidesError(res: Response): Promise<never> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { error?: string; message?: string };
    if (body.error === 'chat_not_available') {
      throw new Error('Chat is only available during an active trip.');
    }
    throw new Error(body.message ?? body.error ?? text);
  } catch (e) {
    if (e instanceof Error && e.message !== text) throw e;
    throw new Error(text || `Request failed (HTTP ${res.status})`);
  }
}

export async function ridesDriverListMessages(
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
  if (!res.ok) await parseDriverRidesError(res);
  return res.json();
}

export async function ridesDriverSendMessage(
  rideId: string,
  body: SendRideMessageBody,
): Promise<SendRideMessageResponse> {
  const res = await fetch(`${base}/v1/requests/${rideId}/messages`, {
    method: 'POST',
    headers: await ridesHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseDriverRidesError(res);
  return res.json();
}

export type { RideMessageDto };
