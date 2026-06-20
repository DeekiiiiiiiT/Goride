/**
 * Courier Admin Service — API client for delivery edge admin routes.
 */

import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import type {
  CourierApproveResult,
  CourierAdminPermissions,
  CourierComplianceRow,
  CourierDetailDto,
  CourierDirectoryRow,
  CourierDeliveryLedgerRow,
  CourierPresenceRow,
  CourierStats,
} from '@roam/types/courier';

const BASE = API_ENDPOINTS.delivery;

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
    return 'Server returned HTML instead of JSON. Deploy the delivery Edge function.';
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
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`Empty response (HTTP ${res.status})`);
  return JSON.parse(trimmed) as T;
}

export async function getCourierStats(accessToken: string): Promise<CourierStats> {
  const res = await fetch(`${BASE}/admin/couriers/stats`, { headers: headers(accessToken) });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson<CourierStats>(res);
}

export async function listCouriers(
  accessToken: string,
  opts: {
    q?: string;
    status?: string;
    live_status?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ couriers: CourierDirectoryRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.q) sp.set('q', opts.q);
  if (opts.status) sp.set('status', opts.status);
  if (opts.live_status) sp.set('live_status', opts.live_status);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));

  const res = await fetch(`${BASE}/admin/couriers?${sp.toString()}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function getCourierDetail(
  accessToken: string,
  userId: string,
): Promise<{ courier: CourierDetailDto; permissions: CourierAdminPermissions }> {
  const res = await fetch(`${BASE}/admin/couriers/${encodeURIComponent(userId)}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function listCourierDeliveries(
  accessToken: string,
  userId: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{ deliveries: Array<Record<string, unknown>>; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  const res = await fetch(
    `${BASE}/admin/couriers/${encodeURIComponent(userId)}/deliveries?${sp.toString()}`,
    { headers: headers(accessToken) },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function listDeliveryLedger(
  accessToken: string,
  opts: {
    page?: number;
    limit?: number;
    courier_user_id?: string;
    status?: string;
    q?: string;
  } = {},
): Promise<{ deliveries: CourierDeliveryLedgerRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  if (opts.courier_user_id) sp.set('courier_user_id', opts.courier_user_id);
  if (opts.status) sp.set('status', opts.status);
  if (opts.q) sp.set('q', opts.q);

  const res = await fetch(`${BASE}/admin/couriers/ledger/deliveries?${sp.toString()}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function listCourierPresence(
  accessToken: string,
  opts: { online_only?: boolean; limit?: number } = {},
): Promise<{ couriers: CourierPresenceRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (opts.online_only) sp.set('online_only', 'true');
  if (opts.limit != null) sp.set('limit', String(opts.limit));

  const res = await fetch(`${BASE}/admin/couriers/presence?${sp.toString()}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function listComplianceQueue(
  accessToken: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ couriers: CourierComplianceRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  if (opts.offset != null) sp.set('offset', String(opts.offset));
  sp.set('queue', 'true');

  const res = await fetch(`${BASE}/admin/couriers/compliance?${sp.toString()}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = await parseJson<{ couriers: CourierComplianceRow[]; total: number }>(res);
  return body;
}

export async function updateComplianceStatus(
  accessToken: string,
  courierId: string,
  updates: { background_check?: 'pending' | 'approved' | 'rejected' | 'expired' },
): Promise<{ ok: boolean; courier?: CourierComplianceRow }> {
  const res = await fetch(`${BASE}/admin/couriers/compliance/${courierId}`, {
    method: 'PATCH',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function approveCourier(
  accessToken: string,
  userId: string,
  opts: { force?: boolean; reason?: string } = {},
): Promise<CourierApproveResult> {
  const res = await fetch(`${BASE}/admin/couriers/${encodeURIComponent(userId)}/approve`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function suspendCourier(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${BASE}/admin/couriers/${encodeURIComponent(userId)}/suspend`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function unsuspendCourier(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${BASE}/admin/couriers/${encodeURIComponent(userId)}/unsuspend`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function deactivateCourier(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${BASE}/admin/couriers/${encodeURIComponent(userId)}/deactivate`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function reactivateCourier(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${BASE}/admin/couriers/${encodeURIComponent(userId)}/reactivate`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function signOutCourier(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/admin/couriers/${encodeURIComponent(userId)}/sign-out`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function resetCourierPassword(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; message: string; email?: string; recovery_link?: string }> {
  const res = await fetch(`${BASE}/admin/couriers/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function deleteCourier(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE}/admin/couriers/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export type SupportOrderRow = Record<string, unknown> & {
  id: string;
  order_number?: string;
  status?: string;
  courier_display_name?: string | null;
};

export async function getOrderById(
  accessToken: string,
  orderId: string,
): Promise<{ order: SupportOrderRow; events: Array<Record<string, unknown>> }> {
  const res = await fetch(`${BASE}/admin/orders/${encodeURIComponent(orderId)}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function cancelOrder(
  accessToken: string,
  orderId: string,
  reason: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/admin/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}

export async function completeOrder(
  accessToken: string,
  orderId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/admin/orders/${encodeURIComponent(orderId)}/complete`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return parseJson(res);
}
