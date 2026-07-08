/**
 * Admin toll monitor — active rides + toll crossing detail from rides Edge API.
 */
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import type { RideRequestRow } from '@roam/types/rides';
import type { TollCrossingsResponse } from '@roam/types/tollCrossings';

const RIDES_BASE = API_ENDPOINTS.rides;

function headers(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { error?: string; message?: string };
    return body.message ?? body.error ?? text.slice(0, 200) ?? `HTTP ${res.status}`;
  } catch {
    return text.slice(0, 200) || `HTTP ${res.status}`;
  }
}

export async function listActiveRidesForTollMonitor(
  accessToken: string,
): Promise<RideRequestRow[]> {
  const res = await fetch(
    `${RIDES_BASE}/admin/dashboard/list?view=active_rides`,
    { headers: headers(accessToken) },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { rides?: RideRequestRow[] };
  return body.rides ?? [];
}

export async function fetchRideTollCrossingsAdmin(
  accessToken: string,
  rideId: string,
): Promise<TollCrossingsResponse> {
  const res = await fetch(`${RIDES_BASE}/v1/requests/${rideId}/toll-crossings`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
