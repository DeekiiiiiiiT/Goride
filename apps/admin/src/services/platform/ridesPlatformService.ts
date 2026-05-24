/**
 * Roam Rides (rider) admin API — rides Edge function.
 */
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import type {
  RiderDetailDto,
  RiderDirectoryRow,
  RiderAdminPermissions,
  RideRequestRow,
} from '@roam/types/rides';

const RIDES_BASE = API_ENDPOINTS.rides;

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
    return 'Rides API returned HTML. Deploy the rides Edge function and verify API_ENDPOINTS.rides.';
  }
  try {
    const body = trimmed
      ? (JSON.parse(trimmed) as { error?: string; message?: string })
      : {};
    if (body.message) return body.message;
    if (body.error) return `${body.error} (HTTP ${res.status})`;
    return trimmed || `HTTP ${res.status}`;
  } catch {
    return trimmed ? `${trimmed.slice(0, 200)} (HTTP ${res.status})` : `HTTP ${res.status}`;
  }
}

async function adminFetch(
  accessToken: string,
  url: string,
  init?: Omit<RequestInit, 'headers'>,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: headers(accessToken, init?.body != null ? 'application/json' : undefined),
  });
}

export async function listRiders(
  accessToken: string,
  opts: { q?: string; status?: string; sort?: string; page?: number; limit?: number } = {},
): Promise<{ riders: RiderDirectoryRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.q) sp.set('q', opts.q);
  if (opts.status) sp.set('status', opts.status);
  if (opts.sort) sp.set('sort', opts.sort);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  const res = await adminFetch(accessToken, `${RIDES_BASE}/admin/riders?${sp.toString()}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getRider(
  accessToken: string,
  userId: string,
): Promise<{ rider: RiderDetailDto; permissions: RiderAdminPermissions }> {
  const res = await adminFetch(accessToken, `${RIDES_BASE}/admin/riders/${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listRiderTrips(
  accessToken: string,
  userId: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{ trips: RideRequestRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  const res = await adminFetch(
    accessToken,
    `${RIDES_BASE}/admin/riders/${encodeURIComponent(userId)}/trips?${sp.toString()}`,
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function suspendRider(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<void> {
  const res = await adminFetch(
    accessToken,
    `${RIDES_BASE}/admin/riders/${encodeURIComponent(userId)}/suspend`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function unsuspendRider(accessToken: string, userId: string): Promise<void> {
  const res = await adminFetch(
    accessToken,
    `${RIDES_BASE}/admin/riders/${encodeURIComponent(userId)}/unsuspend`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function banRider(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<void> {
  const res = await adminFetch(
    accessToken,
    `${RIDES_BASE}/admin/riders/${encodeURIComponent(userId)}/ban`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

/** Lifts suspension (account active again). */
export async function reactivateRider(accessToken: string, userId: string): Promise<void> {
  await unsuspendRider(accessToken, userId);
}

export async function signOutRider(accessToken: string, userId: string): Promise<void> {
  const res = await adminFetch(
    accessToken,
    `${RIDES_BASE}/admin/riders/${encodeURIComponent(userId)}/sign-out`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function deleteRider(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const res = await adminFetch(accessToken, `${RIDES_BASE}/admin/riders/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
