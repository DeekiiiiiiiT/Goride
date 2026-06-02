/**
 * Support Tools API — rides edge admin routes (driver_admin + rides_admin).
 */
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabaseDriverAdmin as supabase } from '@roam/auth-client';
import type { RideRequestRow } from '@roam/types/rides';

const RIDES_BASE = API_ENDPOINTS.rides;

export type SupportRideRow = RideRequestRow & {
  driver_display_name?: string | null;
  driver_email?: string | null;
};

export type SupportCancelReasonCode =
  | 'stuck_offline'
  | 'rider_no_show'
  | 'driver_unable_to_complete'
  | 'duplicate_request'
  | 'safety'
  | 'other';

export const SUPPORT_CANCEL_REASONS: { value: SupportCancelReasonCode; label: string }[] = [
  { value: 'stuck_offline', label: 'Driver stuck / offline' },
  { value: 'rider_no_show', label: 'Rider no-show' },
  { value: 'driver_unable_to_complete', label: 'Driver unable to complete' },
  { value: 'duplicate_request', label: 'Duplicate request' },
  { value: 'safety', label: 'Safety' },
  { value: 'other', label: 'Other' },
];

export interface RideAuditEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  actor_user_id: string | null;
  created_at: string;
  ride_request_id: string | null;
}

function headers(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

async function resolveAccessToken(accessToken: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const active = session?.access_token ?? accessToken;
  const expiresAt = session?.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  if (session && expiresAt - now < 90) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) return data.session.access_token;
  }
  return active;
}

async function adminFetch(
  accessToken: string,
  url: string,
  init?: Omit<RequestInit, 'headers'>,
): Promise<Response> {
  let token = await resolveAccessToken(accessToken);
  const withHeaders = (t: string): RequestInit => ({
    ...init,
    headers: headers(t, init?.body != null ? 'application/json' : undefined),
  });

  let res = await fetch(url, withHeaders(token));
  if (res.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) {
      token = data.session.access_token;
      res = await fetch(url, withHeaders(token));
    }
  }
  return res;
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    return 'Server returned HTML instead of JSON. Deploy the rides Edge function.';
  }
  try {
    const body = trimmed
      ? (JSON.parse(trimmed) as { error?: string; message?: string })
      : {};
    if (body.message) return body.message;
    if (body.error === 'Forbidden') {
      return 'Access denied. You need driver_admin, driver_ops, rides_admin, or platform support role.';
    }
    if (body.error) return `${body.error} (HTTP ${res.status})`;
    return trimmed || `HTTP ${res.status}`;
  } catch {
    return trimmed ? `${trimmed.slice(0, 200)} (HTTP ${res.status})` : `HTTP ${res.status}`;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isFullRideUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export async function getStuckTrips(
  accessToken: string,
  staleMinutes = 15,
): Promise<{ rides: SupportRideRow[]; stale_minutes: number }> {
  const res = await adminFetch(
    accessToken,
    `${RIDES_BASE}/admin/support/stuck-trips?stale_minutes=${staleMinutes}`,
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getRideById(
  accessToken: string,
  rideId: string,
): Promise<{ ride: SupportRideRow }> {
  const res = await adminFetch(
    accessToken,
    `${RIDES_BASE}/admin/rides/${encodeURIComponent(rideId.trim())}`,
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getRideAudit(
  accessToken: string,
  rideId: string,
): Promise<{ events: RideAuditEvent[] }> {
  const res = await adminFetch(
    accessToken,
    `${RIDES_BASE}/admin/rides/${encodeURIComponent(rideId.trim())}/audit`,
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function forceCancelRide(
  accessToken: string,
  rideId: string,
  opts: {
    support_reason_code: SupportCancelReasonCode;
    support_note?: string;
  },
): Promise<{ ride: SupportRideRow; skipped?: boolean }> {
  const res = await adminFetch(
    accessToken,
    `${RIDES_BASE}/admin/rides/${encodeURIComponent(rideId)}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({
        support_reason_code: opts.support_reason_code,
        support_note: opts.support_note?.trim() || undefined,
      }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function forceCompleteRide(
  accessToken: string,
  rideId: string,
  supportNote?: string,
): Promise<{ ride: SupportRideRow; skipped?: boolean }> {
  const res = await adminFetch(
    accessToken,
    `${RIDES_BASE}/admin/rides/${encodeURIComponent(rideId)}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({
        support_note: supportNote?.trim() || undefined,
      }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
