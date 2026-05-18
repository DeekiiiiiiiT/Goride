/**
 * Driver Admin Service - API client for driver operations
 */

import type {
  DriverDetailDto,
  DriverDirectoryRow,
  DriverAdminPermissions,
} from '@roam/types/driver';
import type { RideRequestRow } from '@roam/types/rides';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const DRIVER_BASE = `${SUPABASE_URL}/functions/v1/driver`;

export interface DriverPresenceRow {
  driver_id: string;
  lat: number;
  lng: number;
  is_available: boolean;
  last_seen: string;
  live_status?: string;
  trip_status?: string | null;
}

export interface DriverOfferRow {
  id: string;
  ride_request_id: string;
  driver_user_id: string;
  status: string;
  wave: number;
  created_at: string;
  expires_at: string;
}

export interface DriverComplianceRow {
  driver_id: string;
  driver_name?: string;
  driver_email?: string;
  license_verified: boolean;
  insurance_verified: boolean;
  vehicle_verified: boolean;
  background_check: string;
  onboarding_complete?: boolean;
  created_at: string;
}

export interface DriverStats {
  total_drivers: number;
  active_drivers: number;
  pending_compliance: number;
  online_now: number;
}

function headers(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: SUPABASE_ANON_KEY,
  };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (body.message) return body.message;
  if (body.error === 'driver_admin_db_unavailable') {
    return body.message ?? 'Driver admin tables are missing. Run migration 20260519120000_driver_admin_directory.sql.';
  }
  if (body.error) return `${body.error} (HTTP ${res.status})`;
  return `HTTP ${res.status}`;
}

export async function getDriverStats(accessToken: string): Promise<DriverStats> {
  const res = await fetch(`${DRIVER_BASE}/admin/stats`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listDrivers(
  accessToken: string,
  opts: {
    q?: string;
    status?: string;
    live_status?: string;
    mode?: string;
    onboarding?: string;
    sort?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ drivers: DriverDirectoryRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.q) sp.set('q', opts.q);
  if (opts.status) sp.set('status', opts.status);
  if (opts.live_status) sp.set('live_status', opts.live_status);
  if (opts.mode) sp.set('mode', opts.mode);
  if (opts.onboarding) sp.set('onboarding', opts.onboarding);
  if (opts.sort) sp.set('sort', opts.sort);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));

  const res = await fetch(`${DRIVER_BASE}/admin/drivers?${sp.toString()}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getDriverDetail(
  accessToken: string,
  userId: string,
): Promise<{ driver: DriverDetailDto; permissions: DriverAdminPermissions }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listDriverTrips(
  accessToken: string,
  userId: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{ trips: RideRequestRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  const res = await fetch(
    `${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}/trips?${sp.toString()}`,
    { headers: headers(accessToken) },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listDriverPresence(
  accessToken: string,
  opts: { online_only?: boolean; limit?: number } = {},
): Promise<{ drivers: DriverPresenceRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (opts.online_only) sp.set('online_only', 'true');
  if (opts.limit != null) sp.set('limit', String(opts.limit));

  const res = await fetch(`${DRIVER_BASE}/admin/presence?${sp.toString()}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listDriverOffers(
  accessToken: string,
  opts: { status?: string; limit?: number } = {},
): Promise<{ offers: DriverOfferRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (opts.status) sp.set('status', opts.status);
  if (opts.limit != null) sp.set('limit', String(opts.limit));

  const res = await fetch(`${DRIVER_BASE}/admin/offers?${sp.toString()}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function cancelOffer(
  accessToken: string,
  offerId: string,
  reason?: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${DRIVER_BASE}/admin/offers/${offerId}/cancel`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listComplianceQueue(
  accessToken: string,
  opts: { status?: string; limit?: number } = {},
): Promise<{ drivers: DriverComplianceRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (opts.status) sp.set('status', opts.status);
  if (opts.limit != null) sp.set('limit', String(opts.limit));

  const res = await fetch(`${DRIVER_BASE}/admin/compliance?${sp.toString()}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateComplianceStatus(
  accessToken: string,
  driverId: string,
  updates: {
    background_check?: 'pending' | 'approved' | 'rejected';
  },
): Promise<{ ok: boolean }> {
  const res = await fetch(`${DRIVER_BASE}/admin/compliance/${driverId}`, {
    method: 'PATCH',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
