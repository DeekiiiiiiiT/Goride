import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';

const BASE = API_ENDPOINTS.delivery;

async function authHeaders(contentType = true): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const h: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    apikey: publicAnonKey,
  };
  if (contentType) h['Content-Type'] = 'application/json';
  return h;
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = text ? (JSON.parse(text) as { error?: string }) : {};
    return body.error || text || `HTTP ${res.status}`;
  } catch {
    return text.slice(0, 200) || `HTTP ${res.status}`;
  }
}

export type AvailableOrder = {
  id: string;
  order_number?: string;
  status: string;
  delivery_fee?: number;
  tip?: number;
  delivery_address?: string;
  delivery_lat?: number;
  delivery_lng?: number;
  delivery_instructions?: string;
  ready_at?: string;
  items?: Array<{ name?: string; quantity?: number; note?: string }>;
  customer_name?: string;
  customer_phone?: string;
  customer?: { name?: string | null; phone?: string | null } | null;
  merchant?: {
    id: string;
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    phone?: string;
    vertical_type?: import('@roam/types').VerticalType;
    fulfillment_type?: import('@roam/types').FulfillmentType;
  } | null;
};

export type CourierOfferRow = {
  id: string;
  order_id: string;
  status: string;
  expires_at: string;
  order?: AvailableOrder | null;
};

export async function putCourierAvailability(input: {
  isOnline: boolean;
  lat?: number;
  lng?: number;
  activeOrderId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(`${BASE}/courier/availability`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    return { ok: false, error: await parseError(res) };
  }
  return { ok: true };
}

export async function fetchAvailableOrders(): Promise<AvailableOrder[]> {
  const headers = await authHeaders(false);
  if (!headers) return [];
  const res = await fetch(`${BASE}/courier/available-orders`, { headers });
  if (!res.ok) return [];
  const body = (await res.json()) as { orders?: AvailableOrder[] };
  return body.orders || [];
}

export async function fetchCourierOffers(): Promise<CourierOfferRow[]> {
  const headers = await authHeaders(false);
  if (!headers) return [];
  const res = await fetch(`${BASE}/courier/offers`, { headers });
  if (!res.ok) return [];
  const body = (await res.json()) as { offers?: CourierOfferRow[] };
  return body.offers || [];
}

export async function acceptDeliveryOrder(orderId: string): Promise<{ ok: true; order: AvailableOrder } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(`${BASE}/orders/${orderId}/accept-delivery`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) return { ok: false, error: await parseError(res) };
  const body = (await res.json()) as { order: AvailableOrder };
  return { ok: true, order: body.order };
}

export async function acceptCourierOffer(offerId: string): Promise<{ ok: true; order: AvailableOrder } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(`${BASE}/courier/offers/${offerId}/accept`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) return { ok: false, error: await parseError(res) };
  const body = (await res.json()) as { order: AvailableOrder };
  return { ok: true, order: body.order };
}

export async function declineCourierOffer(offerId: string, reasonId?: string): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  const res = await fetch(`${BASE}/courier/offers/${offerId}/decline`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reasonId }),
  });
  return res.ok;
}

export async function updateCourierOrderStatus(
  orderId: string,
  status: string,
  notes?: string,
): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  const res = await fetch(`${BASE}/orders/${orderId}/status`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ status, notes, actorType: 'courier' }),
  });
  return res.ok;
}

/** Poll active delivery order status (detect merchant/admin remote cancel). */
export async function fetchCourierOrderStatus(
  orderId: string,
): Promise<{ status: string } | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  const res = await fetch(`${BASE}/orders/${orderId}`, { headers });
  if (!res.ok) return null;
  const json = (await res.json()) as { order?: { status?: string } };
  const status = json.order?.status;
  return status ? { status } : null;
}

export async function patchCourierLocation(
  orderId: string,
  lat: number,
  lng: number,
  clientSeq?: number,
): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  const body: Record<string, number> = { lat, lng };
  if (clientSeq != null && Number.isFinite(clientSeq)) {
    body.client_seq = Math.trunc(clientSeq);
  }
  const res = await fetch(`${BASE}/orders/${orderId}/courier-location`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function submitCourierProof(
  orderId: string,
  kind: 'age_verify' | 'pickup' | 'delivery',
  photoUrl: string,
): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  const res = await fetch(`${BASE}/orders/${orderId}/courier-proof`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind, photoUrl }),
  });
  return res.ok;
}

export async function submitCourierIssue(
  orderId: string,
  issueType: string,
  notes?: string,
  photoUrl?: string,
): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  const res = await fetch(`${BASE}/orders/${orderId}/courier-issue`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ issueType, notes, photoUrl }),
  });
  return res.ok;
}

export type CourierPayout = {
  id: string;
  amount: number;
  status: string;
  currency?: string;
  period_start?: string;
  period_end?: string;
  delivery_count?: number;
  created_at?: string;
};

export type CourierConnectStatus = {
  onboarded: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  accountId: string | null;
  error?: string;
};

export async function fetchCourierEarnings(period: 'today' | 'week' | 'month') {
  const headers = await authHeaders(false);
  if (!headers) return null;
  const res = await fetch(`${BASE}/courier/earnings?period=${period}`, { headers });
  if (!res.ok) return null;
  return (await res.json()) as {
    period: string;
    total: number;
    deliveryCount: number;
    deliveries: Array<{
      id: string;
      orderNumber?: string;
      restaurant: string;
      dropoff: string;
      amount: number;
      time?: string;
    }>;
    payouts: CourierPayout[];
  };
}

export async function fetchCourierConnectStatus(): Promise<CourierConnectStatus | null> {
  const headers = await authHeaders(false);
  if (!headers) return null;
  const res = await fetch(`${BASE}/courier/connect/status`, { headers });
  if (!res.ok) return null;
  return (await res.json()) as CourierConnectStatus;
}

export async function startCourierConnectOnboard(returnUrl?: string) {
  const headers = await authHeaders();
  if (!headers) return null;
  const res = await fetch(`${BASE}/courier/connect/onboard`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ returnUrl }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { url: string; accountId: string };
}

export async function closeCourierPayoutPeriod(periodStart: string, periodEnd: string) {
  const headers = await authHeaders();
  if (!headers) return null;
  const res = await fetch(`${BASE}/courier/payouts/close-period`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ periodStart, periodEnd }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { payout: unknown };
}

export async function subscribeCourierPush(
  endpoint: string,
  keys?: Record<string, string>,
  platform?: 'fcm' | 'apns' | 'web_push',
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return false;
  const body: Record<string, unknown> = {
    endpoint,
    keys,
    audience: 'courier',
  };
  if (platform === 'fcm' || platform === 'apns') {
    body.platform = platform;
    body.token = endpoint.includes(':') ? endpoint.slice(endpoint.indexOf(':') + 1) : endpoint;
  }
  const res = await fetch(`${API_ENDPOINTS.notifications}/subscribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: publicAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.ok || res.status === 202;
}
