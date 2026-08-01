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

/** Public POD endpoints (no auth). */
async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_ENDPOINTS.freight}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: publicAnonKey,
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof json.error === 'string' ? json.error : res.statusText);
  }
  return json as T;
}

export const freightService = {
  dashboard: (organizationId?: string | null) =>
    freightFetch<{ counts: Record<string, number>; exceptions: number }>('/dashboard', {
      organizationId,
    }),

  pipelineDashboard: (organizationId?: string | null) =>
    freightFetch<{ counts: Record<string, number> }>('/pipeline/dashboard', {
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

  // --- Pipeline ---
  listFacilities: (organizationId?: string | null, type?: string) =>
    freightFetch<{ facilities: Record<string, unknown>[] }>(
      `/facilities${type ? `?type=${encodeURIComponent(type)}` : ''}`,
      { organizationId },
    ),

  createFacility: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ facility: Record<string, unknown> }>('/facilities', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  seedFacilities: (organizationId?: string | null) =>
    freightFetch<{ facilities: Record<string, unknown>[] }>('/facilities/seed-defaults', {
      method: 'POST',
      organizationId,
    }),

  listSuites: (organizationId?: string | null) =>
    freightFetch<{ suites: Record<string, unknown>[] }>('/suites', { organizationId }),

  createSuite: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ suite: Record<string, unknown> }>('/suites', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  listPackages: (organizationId?: string | null, status?: string) =>
    freightFetch<{ packages: Record<string, unknown>[] }>(
      `/packages${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      { organizationId },
    ),

  getPackage: (id: string, organizationId?: string | null) =>
    freightFetch<{
      package: Record<string, unknown>;
      scanEvents: Record<string, unknown>[];
    }>(`/packages/${id}`, { organizationId }),

  createPackage: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ package: Record<string, unknown> }>('/packages', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  updatePackage: (id: string, body: unknown, organizationId?: string | null) =>
    freightFetch<{ package: Record<string, unknown> }>(`/packages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      organizationId,
    }),

  scan: (body: unknown, organizationId?: string | null, idempotencyKey?: string) =>
    freightFetch<{
      package: Record<string, unknown>;
      scanEvent: Record<string, unknown>;
      createdUnknown?: boolean;
      duplicate?: boolean;
    }>('/scans', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    }),

  hubSort: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ package: Record<string, unknown> }>('/hub/sort', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  listManifests: (organizationId?: string | null, status?: string) =>
    freightFetch<{ manifests: Record<string, unknown>[] }>(
      `/manifests${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      { organizationId },
    ),

  getManifest: (id: string, organizationId?: string | null) =>
    freightFetch<{
      manifest: Record<string, unknown>;
      lines: Record<string, unknown>[];
      customsCase: Record<string, unknown> | null;
    }>(`/manifests/${id}`, { organizationId }),

  createManifest: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ manifest: Record<string, unknown> }>('/manifests', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  addManifestPackages: (
    id: string,
    packageIds: string[],
    organizationId?: string | null,
  ) =>
    freightFetch<{ added: Record<string, unknown>[] }>(`/manifests/${id}/packages`, {
      method: 'POST',
      body: JSON.stringify({ packageIds }),
      organizationId,
    }),

  sealManifest: (id: string, organizationId?: string | null) =>
    freightFetch<{ manifest: Record<string, unknown> }>(`/manifests/${id}/seal`, {
      method: 'POST',
      organizationId,
      headers: { 'Idempotency-Key': `seal-ui:${id}` },
    }),

  transitionManifest: (
    id: string,
    status: string,
    awbOrBl?: string,
    organizationId?: string | null,
  ) =>
    freightFetch<{ manifest: Record<string, unknown> }>(`/manifests/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status, awbOrBl }),
      organizationId,
    }),

  customsExport: (id: string, organizationId?: string | null) =>
    freightFetch<{
      manifestNumber: string;
      csv: string;
      invoicePaths: string[];
    }>(`/manifests/${id}/customs-export`, { organizationId }),

  listCustomsCases: (organizationId?: string | null) =>
    freightFetch<{ customsCases: Record<string, unknown>[] }>('/customs-cases', {
      organizationId,
    }),

  updateCustomsCase: (id: string, body: unknown, organizationId?: string | null) =>
    freightFetch<{ customsCase: Record<string, unknown> }>(`/customs-cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      organizationId,
    }),

  listClientFleet: (organizationId?: string | null, clientId?: string) =>
    freightFetch<{ assets: Record<string, unknown>[] }>(
      `/client-fleet${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`,
      { organizationId },
    ),

  createClientFleet: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ asset: Record<string, unknown> }>('/client-fleet', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  listReadyFulfillment: (organizationId?: string | null) =>
    freightFetch<{ packages: Record<string, unknown>[] }>('/fulfillment/ready', {
      organizationId,
    }),

  collectPickup: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ package: Record<string, unknown> }>('/fulfillment/pickup/collect', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  createDeliveryBatch: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ batch: Record<string, unknown>; podToken: string }>(
      '/fulfillment/batches',
      {
        method: 'POST',
        body: JSON.stringify(body),
        organizationId,
      },
    ),

  listDeliveryBatches: (organizationId?: string | null) =>
    freightFetch<{ batches: Record<string, unknown>[] }>('/fulfillment/batches', {
      organizationId,
    }),

  getDeliveryBatch: (id: string, organizationId?: string | null) =>
    freightFetch<{
      batch: Record<string, unknown>;
      stops: Record<string, unknown>[];
    }>(`/fulfillment/batches/${id}`, { organizationId }),

  loadBatchStop: (
    batchId: string,
    packageId: string,
    organizationId?: string | null,
  ) =>
    freightFetch<{ stop: Record<string, unknown> }>(
      `/fulfillment/batches/${batchId}/load`,
      {
        method: 'POST',
        body: JSON.stringify({ packageId }),
        organizationId,
      },
    ),

  deliverBatchStop: (
    batchId: string,
    body: unknown,
    organizationId?: string | null,
  ) =>
    freightFetch<{ stop: Record<string, unknown> }>(
      `/fulfillment/batches/${batchId}/deliver-stop`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        organizationId,
      },
    ),

  publicPod: (token: string) =>
    publicFetch<{
      batchNumber: string;
      status: string;
      stops: Record<string, unknown>[];
    }>(`/public/pod/${token}`),

  publicPodDeliver: (token: string, body: unknown) =>
    publicFetch<{ stop: Record<string, unknown> }>(`/public/pod/${token}/deliver`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
