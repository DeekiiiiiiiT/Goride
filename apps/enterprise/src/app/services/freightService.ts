import { API_ENDPOINTS, getProductLineHeaders, publicAnonKey } from '@roam/api-client';
import { supabaseEnterpriseApp } from '@roam/auth-client';

async function authHeaders(organizationId?: string | null): Promise<HeadersInit> {
  const { data } = await supabaseEnterpriseApp.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
    ...getProductLineHeaders(),
    ...(organizationId ? { 'X-Roam-Organization-Id': organizationId } : {}),
  };
}

async function freightFetch<T>(
  path: string,
  init?: RequestInit & { organizationId?: string | null },
): Promise<T> {
  const { organizationId, ...rest } = init ?? {};
  const headers = await authHeaders(organizationId);
  const res = await fetch(`${API_ENDPOINTS.freight}${path}`, {
    ...rest,
    headers: { ...headers, ...(rest.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof json.error === 'string'
        ? json.error
        : json.error?.formErrors?.[0] || res.statusText || 'Request failed',
    );
  }
  return json as T;
}

export const freightService = {
  dashboard: (organizationId?: string | null) =>
    freightFetch<{ counts: Record<string, number>; exceptions: number }>('/dashboard', {
      organizationId,
    }),

  listShipments: (organizationId?: string | null, status?: string) =>
    freightFetch<{ shipments: Record<string, unknown>[] }>(
      `/shipments${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      { organizationId },
    ),

  getShipment: (id: string, organizationId?: string | null) =>
    freightFetch<{
      shipment: Record<string, unknown>;
      legs: Record<string, unknown>[];
      consignments: Record<string, unknown>[];
      trackingEvents: Record<string, unknown>[];
      documents: Record<string, unknown>[];
    }>(`/shipments/${id}`, { organizationId }),

  createShipment: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ shipment: Record<string, unknown> }>('/shipments', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  transitionShipment: (
    id: string,
    status: string,
    note?: string,
    organizationId?: string | null,
  ) =>
    freightFetch<{ shipment: Record<string, unknown> }>(`/shipments/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
      organizationId,
    }),

  billShipment: (id: string, organizationId?: string | null) =>
    freightFetch<{ shipment: Record<string, unknown>; skipped?: boolean }>(
      `/shipments/${id}/bill`,
      {
        method: 'POST',
        organizationId,
        headers: { 'Idempotency-Key': `freight-bill-ui:${id}` },
      },
    ),

  listCarriers: (organizationId?: string | null, own?: boolean) =>
    freightFetch<{ carriers: Record<string, unknown>[] }>(
      `/carriers${own === undefined ? '' : `?own=${own}`}`,
      { organizationId },
    ),

  createCarrier: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ carrier: Record<string, unknown> }>('/carriers', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  listClients: (organizationId?: string | null) =>
    freightFetch<{ clients: Record<string, unknown>[] }>('/clients', { organizationId }),

  createClient: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ client: Record<string, unknown> }>('/clients', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  listRateCards: (organizationId?: string | null) =>
    freightFetch<{ rateCards: Record<string, unknown>[] }>('/rate-cards', {
      organizationId,
    }),

  createRateCard: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ rateCard: Record<string, unknown> }>('/rate-cards', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),
};
