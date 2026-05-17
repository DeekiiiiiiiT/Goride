/**
 * Rides Admin Service - API client for fare rules and surge pricing
 */

import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';

const RIDES_BASE = API_ENDPOINTS.rides;

export interface FareRuleAdminDto {
  id: string;
  city: string;
  location_key: string;
  location_label: string;
  county: string | null;
  parish: string | null;
  locality: string | null;
  vehicle_type: string;
  currency: string;
  is_active: boolean;
  effective_from?: string;
  base_fare: number;
  base_fare_minor: number;
  price_per_km: number;
  price_per_km_minor: number;
  price_per_min: number;
  price_per_min_minor: number;
  booking_fee: number;
  booking_fee_minor: number;
  estimated_tolls: number;
  estimated_tolls_minor: number;
  min_fare: number;
  min_fare_minor: number;
  created_at: string;
  updated_at: string | null;
}

export interface FareRuleAdminInput {
  /** @deprecated Use location_scope + county/parish/locality; kept for older API builds */
  city?: string;
  location_key?: string;
  location_scope?: 'country' | 'county' | 'parish' | 'locality';
  county?: string;
  parish?: string;
  locality?: string;
  vehicle_type: string;
  currency?: string;
  is_active?: boolean;
  base_fare: number;
  price_per_km: number;
  price_per_min: number;
  booking_fee: number;
  estimated_tolls: number;
  min_fare: number;
}

export interface SurgeCellAdminRow {
  cell_key: string;
  surge_multiplier: number;
  open_requests: number;
  available_drivers: number;
  updated_at: string | null;
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
    return 'Server returned HTML instead of JSON. Check that the rides Edge function is deployed.';
  }
  try {
    const body = trimmed
      ? (JSON.parse(trimmed) as { error?: string; message?: string })
      : {};
    if (body.message) return body.message;
    if (body.error === 'rides_admin_db_unavailable') {
      return 'Rides admin tables are missing. Apply Supabase migrations (rides_public_admin_views) or expose the rides schema in API settings.';
    }
    if (body.error === 'city_and_vehicle_required') {
      return 'Location and vehicle type are required. Redeploy the rides Edge function, then hard-refresh this page.';
    }
    if (body.error) return `${body.error} (HTTP ${res.status})`;
    return trimmed || `HTTP ${res.status}`;
  } catch {
    return trimmed ? `${trimmed.slice(0, 200)} (HTTP ${res.status})` : `HTTP ${res.status}`;
  }
}

export async function listFareRules(
  accessToken: string
): Promise<{ rules: FareRuleAdminDto[] }> {
  const res = await fetch(`${RIDES_BASE}/admin/fare-rules`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createFareRule(
  accessToken: string,
  input: FareRuleAdminInput
): Promise<{ rule: FareRuleAdminDto }> {
  const res = await fetch(`${RIDES_BASE}/admin/fare-rules`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateFareRule(
  accessToken: string,
  id: string,
  input: Partial<FareRuleAdminInput>
): Promise<{ rule: FareRuleAdminDto }> {
  const res = await fetch(`${RIDES_BASE}/admin/fare-rules/${id}`, {
    method: 'PATCH',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteFareRule(
  accessToken: string,
  id: string
): Promise<{ ok: boolean; id: string }> {
  const url = `${RIDES_BASE}/admin/fare-rules/${id}/delete`;
  let res: Response;
  try {
    // POST avoids browser/CORS issues with DELETE on some deployed rides functions.
    res = await fetch(url, {
      method: 'POST',
      headers: headers(accessToken, 'application/json'),
      body: '{}',
    });
  } catch {
    throw new Error(
      'Could not reach the rides API. Run: supabase functions deploy rides — then hard-refresh this page.'
    );
  }
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listSurgeCells(
  accessToken: string,
  opts: { search?: string; page?: number; limit?: number } = {}
): Promise<{ cells: SurgeCellAdminRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.search) sp.set('search', opts.search);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  const res = await fetch(`${RIDES_BASE}/admin/surge-cells?${sp.toString()}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateSurgeCell(
  accessToken: string,
  cellKey: string,
  surge_multiplier: number
): Promise<{ cell: SurgeCellAdminRow }> {
  const res = await fetch(`${RIDES_BASE}/admin/surge-cells/${encodeURIComponent(cellKey)}`, {
    method: 'PATCH',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({ surge_multiplier }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function resetSurgeCell(
  accessToken: string,
  cellKey: string,
  reset_multiplier = false
): Promise<{ cell: SurgeCellAdminRow }> {
  const res = await fetch(
    `${RIDES_BASE}/admin/surge-cells/${encodeURIComponent(cellKey)}/reset`,
    {
      method: 'POST',
      headers: headers(accessToken, 'application/json'),
      body: JSON.stringify({ reset_multiplier }),
    }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function resetAllSurgeCells(
  accessToken: string,
  reset_multiplier = true
): Promise<{ ok: boolean; rows_updated: number }> {
  const res = await fetch(`${RIDES_BASE}/admin/surge-cells/reset-all`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({ reset_multiplier }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export function formatMoneyMinor(minorUnits: number, currency = 'JMD'): string {
  const major = minorUnits / 100;
  return new Intl.NumberFormat('en-JM', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(major);
}
