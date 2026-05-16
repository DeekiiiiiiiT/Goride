/**
 * Rides Admin Service - API client for fare rules and surge pricing
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const RIDES_BASE = `${SUPABASE_URL}/functions/v1/rides`;

export interface FareRuleAdminDto {
  id: string;
  city: string;
  vehicle_type: string;
  currency: string;
  is_active: boolean;
  base_fare: number;
  base_fare_minor: number;
  price_per_km: number;
  price_per_km_minor: number;
  price_per_min: number;
  price_per_min_minor: number;
  booking_fee: number;
  booking_fee_minor: number;
  min_fare: number;
  min_fare_minor: number;
  created_at: string;
  updated_at: string | null;
}

export interface FareRuleAdminInput {
  city: string;
  vehicle_type: string;
  currency?: string;
  is_active?: boolean;
  base_fare: number;
  price_per_km: number;
  price_per_min: number;
  booking_fee: number;
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
    apikey: SUPABASE_ANON_KEY,
  };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return body.message || body.error || `HTTP ${res.status}`;
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
