/**
 * Driver Admin Service - API client for driver operations
 */

import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import type {
  DriverDetailDto,
  DriverDirectoryRow,
  DriverAdminPermissions,
} from '@roam/types/driver';
import type { RideRequestRow } from '@roam/types/rides';

const DRIVER_BASE = API_ENDPOINTS.driver;

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
  /** Available for dispatch (fresh GPS, not on an active trip). */
  online_now: number;
  /** Assigned to an active ride (en route, at pickup, or on trip). */
  on_trip_now: number;
}

function headers(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    return 'Server returned HTML instead of JSON. Deploy the driver Edge function and check API_ENDPOINTS.driver.';
  }
  try {
    const body = trimmed
      ? (JSON.parse(trimmed) as { error?: string; message?: string })
      : {};
    if (body.message) return body.message;
    if (body.error === 'driver_admin_db_unavailable') {
      return body.message ?? 'Driver admin tables are missing. Run migration 20260519120000_driver_admin_directory.sql.';
    }
    if (body.error) return `${body.error} (HTTP ${res.status})`;
    return trimmed || `HTTP ${res.status}`;
  } catch {
    return trimmed ? `${trimmed.slice(0, 200)} (HTTP ${res.status})` : `HTTP ${res.status}`;
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      'Server returned HTML instead of JSON. Deploy the driver Edge function and check API_ENDPOINTS.driver.',
    );
  }
  if (!trimmed) {
    throw new Error(`Empty response (HTTP ${res.status})`);
  }
  return JSON.parse(trimmed) as T;
}

export async function getDriverStats(accessToken: string): Promise<DriverStats> {
  const res = await fetch(`${DRIVER_BASE}/admin/stats`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson<DriverStats>(res);
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
  return parseJson(res);
}

export async function getDriverDetail(
  accessToken: string,
  userId: string,
): Promise<{ driver: DriverDetailDto; permissions: DriverAdminPermissions }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
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
  return parseJson(res);
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
  return parseJson(res);
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
  return parseJson(res);
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
  return parseJson(res);
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
  return parseJson(res);
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
  return parseJson(res);
}

// ---------------------------------------------------------------------------
// Driver Lifecycle Actions
// ---------------------------------------------------------------------------

/**
 * Suspend a driver account (temporary block).
 * Sets status to "suspended", applies 1-year auth ban.
 */
export async function suspendDriver(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}/suspend`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

/**
 * Unsuspend a driver account (lift temporary block).
 * Sets status back to "active", removes auth ban.
 */
export async function unsuspendDriver(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}/unsuspend`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

/**
 * Deactivate a driver account (permanent block, stronger than suspend).
 * Sets status to "deactivated", applies ~100-year auth ban.
 */
export async function deactivateDriver(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}/deactivate`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

/**
 * Reactivate a deactivated driver account.
 * Sets status back to "active", removes auth ban.
 */
export async function reactivateDriver(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}/reactivate`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

/**
 * Force sign out a driver from all devices.
 */
export async function signOutDriver(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}/sign-out`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

/**
 * Send password reset email for a driver.
 * Platform admins may receive the recovery link directly.
 */
export async function resetDriverPassword(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; message: string; email?: string; recovery_link?: string }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

/**
 * Delete driver profile (product-scoped removal).
 * Removes driver_profiles row, user can re-signup as a new driver.
 * Does NOT delete auth.users - user retains access to other Roam products.
 */
export async function deleteDriver(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}
