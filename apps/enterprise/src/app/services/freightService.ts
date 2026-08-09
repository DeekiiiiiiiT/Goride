import { API_ENDPOINTS, getProductLineHeaders, publicAnonKey } from '@roam/api-client';
import { supabaseEnterpriseApp } from '@roam/auth-client';

async function authHeaders(
  organizationId?: string | null,
  opts?: { json?: boolean },
): Promise<HeadersInit> {
  const { data } = await supabaseEnterpriseApp.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
    ...getProductLineHeaders(),
    ...(organizationId ? { 'X-Roam-Organization-Id': organizationId } : {}),
  };
  if (opts?.json !== false) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
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
    // Prefer human message over machine codes like validation_failed
    const blockers = Array.isArray(json.blockers)
      ? (json.blockers as Array<{ tracking?: string; message?: string }>)
          .slice(0, 3)
          .map((b) => `${b.tracking || 'package'}: ${b.message || 'blocked'}`)
          .join('; ')
      : '';
    const detail =
      (typeof json.message === 'string' && json.message) ||
      (typeof json.msg === 'string' && json.msg) ||
      (blockers ? `Validation failed — ${blockers}` : null) ||
      (typeof json.error === 'string' && json.error) ||
      json.error?.formErrors?.[0] ||
      (typeof json === 'object' && json.error ? JSON.stringify(json.error) : null) ||
      res.statusText ||
      'Request failed';
    throw new Error(`${res.status}: ${detail}`);
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

  updateRateCard: (id: string, body: unknown, organizationId?: string | null) =>
    freightFetch<{ rateCard: Record<string, unknown> }>(`/rate-cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      organizationId,
    }),

  // --- Pipeline ---
  listFacilities: (organizationId?: string | null, type?: string) =>
    freightFetch<{ facilities: Record<string, unknown>[] }>(
      `/facilities${type ? `?type=${encodeURIComponent(type)}` : ''}`,
      { organizationId },
    ),

  listIntakeWarehouses: (organizationId?: string | null) =>
    freightFetch<{ warehouses: Record<string, unknown>[] }>('/intake-warehouses', {
      organizationId,
    }),

  createFacility: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ facility: Record<string, unknown> }>('/facilities', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  updateFacility: (id: string, body: unknown, organizationId?: string | null) =>
    freightFetch<{ facility: Record<string, unknown> }>(`/facilities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      organizationId,
    }),

  deleteFacility: (id: string, organizationId?: string | null) =>
    freightFetch<{ ok: boolean }>(`/facilities/${id}`, {
      method: 'DELETE',
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

  importSuites: (
    rows: Array<{
      suiteCode: string;
      contactName?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      trn?: string | null;
      clientName?: string | null;
      pickupBranch?: string | null;
      defaultFulfillmentMode?: string;
      defaultAssigneeType?: string;
      deliveryAddress?: string | null;
    }>,
    organizationId?: string | null,
  ) =>
    freightFetch<{
      created: number;
      updated: number;
      total: number;
      suites: Record<string, unknown>[];
      warnings?: string[];
    }>('/suites/import', {
      method: 'POST',
      body: JSON.stringify({ rows }),
      organizationId,
    }),

  listPackages: (
    organizationId?: string | null,
    status?: string,
    opts?: { intendedFacilityId?: string },
  ) => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (opts?.intendedFacilityId) qs.set('intendedFacilityId', opts.intendedFacilityId);
    const q = qs.toString();
    return freightFetch<{ packages: Record<string, unknown>[] }>(
      `/packages${q ? `?${q}` : ''}`,
      { organizationId },
    );
  },

  listPreAlerts: (
    organizationId?: string | null,
    opts?: { intendedFacilityId?: string },
  ) =>
    freightFetch<{ packages: Record<string, unknown>[] }>(
      (() => {
        const qs = new URLSearchParams({ status: 'expected' });
        if (opts?.intendedFacilityId) qs.set('intendedFacilityId', opts.intendedFacilityId);
        return `/packages?${qs.toString()}`;
      })(),
      { organizationId },
    ),

  exportPreAlertsCsv: (
    organizationId?: string | null,
    opts?: { intendedFacilityId?: string },
  ) => {
    const qs = new URLSearchParams();
    if (opts?.intendedFacilityId) qs.set('intendedFacilityId', opts.intendedFacilityId);
    const q = qs.toString();
    return freightFetch<{ csv: string; count: number }>(
      `/packages/pre-alerts/export${q ? `?${q}` : ''}`,
      { organizationId },
    );
  },

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
      matchedPreAlert?: boolean;
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

  updateManifest: (id: string, body: unknown, organizationId?: string | null) =>
    freightFetch<{ manifest: Record<string, unknown> }>(`/manifests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      organizationId,
    }),

  deleteManifest: (id: string, organizationId?: string | null) =>
    freightFetch<{ ok: boolean; manifestNumber?: string }>(`/manifests/${id}`, {
      method: 'DELETE',
      organizationId,
    }),

  importWarehouseManifest: (
    body: {
      carrierName?: string | null;
      shipmentType?: 'air' | 'sea';
      originFacilityId?: string | null;
      destinationFacilityId?: string | null;
      awbOrBl?: string | null;
      rows: Array<{
        suiteCode: string;
        contactName?: string | null;
        trn?: string | null;
        courierTrackingNumber: string;
        description?: string | null;
        weightLbs?: number | null;
        lengthIn?: number | null;
        widthIn?: number | null;
        heightIn?: number | null;
        declaredValueUsd?: number | null;
        invoiceFileName?: string | null;
      }>;
    },
    organizationId?: string | null,
  ) =>
    freightFetch<{
      manifestId: string;
      manifestNumber: string;
      added: number;
      createdPackages: number;
      linkedExisting: number;
      warnings: string[];
    }>('/manifests/import-warehouse', {
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

  submitManifestCustoms: (
    id: string,
    body?: {
      brokerRef?: string | null;
      awbOrBl?: string | null;
      flightOrVoyage?: string | null;
      estimatedArrival?: string | null;
    },
    organizationId?: string | null,
  ) =>
    freightFetch<{
      manifestNumber: string;
      csv: string;
      invoicePaths: string[];
      customsCase: Record<string, unknown>;
      message: string;
    }>(`/manifests/${id}/submit-customs`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
      organizationId,
    }),

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

  /** Auth multipart upload into org Files library. */
  uploadOrgFile: async (
    file: File,
    meta: {
      kind: string;
      sourceType?: string;
      sourceId?: string;
      fileName?: string;
    },
    organizationId?: string | null,
  ) => {
    const headers = await authHeaders(organizationId, { json: false });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', meta.kind);
    if (meta.sourceType) fd.append('sourceType', meta.sourceType);
    if (meta.sourceId) fd.append('sourceId', meta.sourceId);
    if (meta.fileName) fd.append('fileName', meta.fileName);
    const res = await fetch(`${API_ENDPOINTS.freight}/files/upload`, {
      method: 'POST',
      headers,
      body: fd,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof json.error === 'string' ? json.error : res.statusText);
    }
    return json as { file: Record<string, unknown> };
  },

  /** Public POD link multipart upload (token-gated). */
  publicPodUpload: async (token: string, file: File, packageId?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (packageId) fd.append('packageId', packageId);
    const res = await fetch(`${API_ENDPOINTS.freight}/public/pod/${token}/upload`, {
      method: 'POST',
      headers: { apikey: publicAnonKey },
      body: fd,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof json.error === 'string' ? json.error : res.statusText);
    }
    return json as { file: Record<string, unknown> };
  },

  listOrgFiles: (
    organizationId?: string | null,
    params?: { kind?: string; q?: string; from?: string; to?: string },
  ) => {
    const sp = new URLSearchParams();
    if (params?.kind) sp.set('kind', params.kind);
    if (params?.q) sp.set('q', params.q);
    if (params?.from) sp.set('from', params.from);
    if (params?.to) sp.set('to', params.to);
    const qs = sp.toString();
    return freightFetch<{ files: Record<string, unknown>[]; canDelete: boolean }>(
      `/files${qs ? `?${qs}` : ''}`,
      { organizationId },
    );
  },

  orgFileUrl: (id: string, organizationId?: string | null) =>
    freightFetch<{ url: string; file: Record<string, unknown> }>(`/files/${id}/url`, {
      organizationId,
    }),

  deleteOrgFile: (id: string, organizationId?: string | null) =>
    freightFetch<{ ok: boolean }>(`/files/${id}`, {
      method: 'DELETE',
      organizationId,
    }),

  // --- Courier OS (duty / readiness / JCA / billing) ---
  pipelineCommand: (organizationId?: string | null) =>
    freightFetch<{
      counts: Record<string, number>;
      dutyOutstandingJmdMinor: number;
      oldestDutyAt?: string | null;
      oldestByStatus?: Record<string, string | null>;
      needsYou?: Array<{
        key: string;
        label: string;
        count: number;
        oldestAt: string | null;
        ageHours: number | null;
        href: string;
        actionLabel: string;
      }>;
    }>('/pipeline/command', {
      organizationId,
    }),

  listHsTariffs: (organizationId?: string | null) =>
    freightFetch<{ tariffs: Record<string, unknown>[] }>('/hs-tariffs', {
      organizationId,
    }),

  createHsTariff: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ tariff: Record<string, unknown> }>('/hs-tariffs', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  updateHsTariff: (id: string, body: unknown, organizationId?: string | null) =>
    freightFetch<{ tariff: Record<string, unknown> }>(`/hs-tariffs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      organizationId,
    }),

  invoiceAuditQueue: (tab: string, organizationId?: string | null) =>
    freightFetch<{ packages: Record<string, unknown>[] }>(
      `/packages/invoice-audit?tab=${encodeURIComponent(tab)}`,
      { organizationId },
    ),

  /** Multipart commercial invoice → org Files + package invoice fields. */
  uploadPackageInvoice: async (
    packageId: string,
    file: File,
    organizationId?: string | null,
    slot: 'warehouse' | 'customer' = 'customer',
  ) => {
    const headers = await authHeaders(organizationId, { json: false });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('fileName', file.name);
    fd.append('slot', slot);
    const res = await fetch(`${API_ENDPOINTS.freight}/packages/${packageId}/invoice`, {
      method: 'POST',
      headers,
      body: fd,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof json.error === 'string' ? json.error : res.statusText);
    }
    return json as {
      package: Record<string, unknown>;
      file: Record<string, unknown>;
      slot: string;
    };
  },

  setInvoiceFlags: (
    id: string,
    body: {
      invoiceRequiredFromCustomer?: boolean;
      invoiceUnobtainable?: boolean;
      unobtainableNote?: string | null;
    },
    organizationId?: string | null,
  ) =>
    freightFetch<{ package: Record<string, unknown> }>(`/packages/${id}/invoice-flags`, {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  verifyInvoice: (id: string, note?: string, organizationId?: string | null) =>
    freightFetch<{ package: Record<string, unknown> }>(`/packages/${id}/verify-invoice`, {
      method: 'POST',
      body: JSON.stringify({ note }),
      organizationId,
    }),

  computeDuty: (id: string, organizationId?: string | null) =>
    freightFetch<{ duty: Record<string, unknown>; result: Record<string, unknown> }>(
      `/packages/${id}/compute-duty`,
      { method: 'POST', organizationId },
    ),

  getPackageDuty: (id: string, organizationId?: string | null) =>
    freightFetch<{ duty: Record<string, unknown> | null }>(`/packages/${id}/duty`, {
      organizationId,
    }),

  manifestReadiness: (id: string, organizationId?: string | null) =>
    freightFetch<{
      blockers: Array<{ packageId: string; tracking: string; code: string; message: string }>;
      readyCount: number;
      total: number;
      canSeal: boolean;
    }>(`/manifests/${id}/readiness`, { organizationId }),

  generateAwbolds: (id: string, organizationId?: string | null) =>
    freightFetch<{ filing: Record<string, unknown>; xml: string; checksum: string }>(
      `/manifests/${id}/awbolds`,
      { method: 'POST', organizationId },
    ),

  submitJca: (id: string, organizationId?: string | null) =>
    freightFetch<{
      filing: Record<string, unknown>;
      result: { status: string; jcaRef: string | null; error: string | null };
    }>(`/manifests/${id}/submit-jca`, { method: 'POST', organizationId }),

  listFilings: (id: string, organizationId?: string | null) =>
    freightFetch<{ filings: Record<string, unknown>[] }>(`/manifests/${id}/filings`, {
      organizationId,
    }),

  listClearanceEvents: (channel?: string, organizationId?: string | null) =>
    freightFetch<{ events: Record<string, unknown>[] }>(
      `/clearance-events${channel ? `?channel=${encodeURIComponent(channel)}` : ''}`,
      { organizationId },
    ),

  postClearanceEvent: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ event: Record<string, unknown>; packageStatus: string }>(
      '/clearance-events',
      {
        method: 'POST',
        body: JSON.stringify(body),
        organizationId,
      },
    ),

  createConsolidatedInvoice: (body: unknown, organizationId?: string | null) =>
    freightFetch<{ invoice: Record<string, unknown>; lines: Record<string, unknown>[] }>(
      '/billing/invoices',
      { method: 'POST', body: JSON.stringify(body), organizationId },
    ),

  listConsolidatedInvoices: (packageId?: string | null, organizationId?: string | null) =>
    freightFetch<{ invoices: Record<string, unknown>[] }>(
      `/billing/invoices${packageId ? `?packageId=${encodeURIComponent(packageId)}` : ''}`,
      { organizationId },
    ),

  getConsolidatedInvoice: (id: string, organizationId?: string | null) =>
    freightFetch<{ invoice: Record<string, unknown>; lines: Record<string, unknown>[] }>(
      `/billing/invoices/${id}`,
      { organizationId },
    ),

  validateTrn: (trn: string, organizationId?: string | null) =>
    freightFetch<{ valid: boolean; normalized: string; error?: string }>('/trn/validate', {
      method: 'POST',
      body: JSON.stringify({ trn }),
      organizationId,
    }),
};
