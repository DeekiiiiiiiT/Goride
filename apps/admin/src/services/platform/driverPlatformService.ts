/**
 * Roam Driver product admin API — uses dedicated driver Edge function.
 */
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import type {
  DriverDetailDto,
  DriverDirectoryRow,
  DriverAdminPermissions,
} from '@roam/types/driver';
import type { RideRequestRow } from '@roam/types/rides';

const DRIVER_BASE = API_ENDPOINTS.driver;

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
    return 'Driver API returned HTML. Deploy the driver Edge function and verify API_ENDPOINTS.driver.';
  }
  try {
    const body = trimmed ? (JSON.parse(trimmed) as { error?: string; message?: string }) : {};
    if (body.message) return body.message;
    if (body.error) return `${body.error} (HTTP ${res.status})`;
    return trimmed || `HTTP ${res.status}`;
  } catch {
    return trimmed ? `${trimmed.slice(0, 200)} (HTTP ${res.status})` : `HTTP ${res.status}`;
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await parseError(res));
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`Empty response (HTTP ${res.status})`);
  return JSON.parse(trimmed) as T;
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
  return parseJson(res);
}

export async function getDriver(
  accessToken: string,
  userId: string,
): Promise<{ driver: DriverDetailDto; permissions: DriverAdminPermissions }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}`, {
    headers: headers(accessToken),
  });
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
  return parseJson(res);
}

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
  return parseJson(res);
}

export async function unsuspendDriver(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}/unsuspend`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

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
  return parseJson(res);
}

export async function reactivateDriver(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}/reactivate`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

export async function signOutDriver(accessToken: string, userId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}/sign-out`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

export async function deleteDriver(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${DRIVER_BASE}/admin/drivers/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: headers(accessToken),
  });
  return parseJson(res);
}
