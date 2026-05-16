/**
 * Roam Rides — Super Admin pricing API (rides Edge function).
 */
import { API_ENDPOINTS } from './apiConfig';
import { publicAnonKey } from '../utils/supabase/info';
import type {
  FareRuleAdminDto,
  FareRuleAdminInput,
  SurgeCellAdminRow,
} from '@roam/types';

function edgeHeaders(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
  return body.message || body.error || `HTTP ${res.status}`;
}

const base = API_ENDPOINTS.rides;

export async function listFareRules(accessToken: string): Promise<{ rules: FareRuleAdminDto[] }> {
  const res = await fetch(`${base}/admin/fare-rules`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createFareRule(
  accessToken: string,
  input: FareRuleAdminInput,
): Promise<{ rule: FareRuleAdminDto }> {
  const res = await fetch(`${base}/admin/fare-rules`, {
    method: 'POST',
    headers: edgeHeaders(accessToken, 'application/json'),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateFareRule(
  accessToken: string,
  id: string,
  input: Partial<FareRuleAdminInput>,
): Promise<{ rule: FareRuleAdminDto }> {
  const res = await fetch(`${base}/admin/fare-rules/${id}`, {
    method: 'PATCH',
    headers: edgeHeaders(accessToken, 'application/json'),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function duplicateFareRule(
  accessToken: string,
  id: string,
  input: { city?: string; vehicle_type?: string; is_active?: boolean },
): Promise<{ rule: FareRuleAdminDto }> {
  const res = await fetch(`${base}/admin/fare-rules/${id}/duplicate`, {
    method: 'POST',
    headers: edgeHeaders(accessToken, 'application/json'),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function listSurgeCells(
  accessToken: string,
  opts: { search?: string; page?: number; limit?: number } = {},
): Promise<{ cells: SurgeCellAdminRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.search) sp.set('search', opts.search);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  const res = await fetch(`${base}/admin/surge-cells?${sp.toString()}`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateSurgeCell(
  accessToken: string,
  cellKey: string,
  surge_multiplier: number,
): Promise<{ cell: SurgeCellAdminRow }> {
  const res = await fetch(`${base}/admin/surge-cells/${encodeURIComponent(cellKey)}`, {
    method: 'PATCH',
    headers: edgeHeaders(accessToken, 'application/json'),
    body: JSON.stringify({ surge_multiplier }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function resetSurgeCell(
  accessToken: string,
  cellKey: string,
  reset_multiplier = false,
): Promise<{ cell: SurgeCellAdminRow }> {
  const res = await fetch(`${base}/admin/surge-cells/${encodeURIComponent(cellKey)}/reset`, {
    method: 'POST',
    headers: edgeHeaders(accessToken, 'application/json'),
    body: JSON.stringify({ reset_multiplier }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function resetAllSurgeCells(
  accessToken: string,
  reset_multiplier = true,
): Promise<{ ok: boolean; rows_updated: number }> {
  const res = await fetch(`${base}/admin/surge-cells/reset-all`, {
    method: 'POST',
    headers: edgeHeaders(accessToken, 'application/json'),
    body: JSON.stringify({ reset_multiplier }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
