/**
 * Driver Admin Service - API client for driver operations
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const DRIVER_BASE = `${SUPABASE_URL}/functions/v1/driver`;

export interface DriverPresenceRow {
  driver_id: string;
  lat: number;
  lng: number;
  is_available: boolean;
  last_seen: string;
  driver_name?: string;
  driver_email?: string;
}

export interface DriverOfferRow {
  id: string;
  ride_id: string;
  driver_id: string;
  wave: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  created_at: string;
  expires_at: string;
  driver_name?: string;
}

export interface DriverComplianceRow {
  driver_id: string;
  driver_name?: string;
  driver_email?: string;
  license_verified: boolean;
  insurance_verified: boolean;
  vehicle_verified: boolean;
  background_check: 'pending' | 'approved' | 'rejected' | 'not_started';
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
  return body.message || body.error || `HTTP ${res.status}`;
}

export async function getDriverStats(accessToken: string): Promise<DriverStats> {
  const res = await fetch(`${DRIVER_BASE}/admin/stats`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listDriverPresence(
  accessToken: string,
  opts: { online_only?: boolean; limit?: number } = {}
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
  opts: { status?: string; limit?: number } = {}
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
  reason?: string
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
  opts: { status?: string; limit?: number } = {}
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
    license_verified?: boolean;
    insurance_verified?: boolean;
    vehicle_verified?: boolean;
    background_check?: 'pending' | 'approved' | 'rejected';
  }
): Promise<{ ok: boolean }> {
  const res = await fetch(`${DRIVER_BASE}/admin/compliance/${driverId}`, {
    method: 'PATCH',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
