import { API_ENDPOINTS } from '@roam/api-client';
import { fetchWithRetry } from '../../services/api';
import { getHeaders } from '../../utils/authHeaders';

const BASE = `${API_ENDPOINTS.fleetCore}/inventory`;

function throwInventoryHttpError(response: Response, body: Record<string, unknown>) {
  const msg = String(body.error ?? body.message ?? `Inventory API ${response.status}`);
  throw new Error(msg);
}

async function invFetch(path: string, init: RequestInit = {}) {
  const headers = await getHeaders();
  const response = await fetchWithRetry(`${BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throwInventoryHttpError(response, body);
  }
  return response.json();
}

async function invFetchRaw(path: string, init: RequestInit = {}) {
  const headers = await getHeaders();
  const response = await fetchWithRetry(`${BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throwInventoryHttpError(response, body);
  }
  return response;
}

function idempotencyHeaders(idempotencyKey: string, json = true): HeadersInit {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    'Idempotency-Key': idempotencyKey,
  };
}

export type Paged<T> = {
  items: T[];
  nextCursor: string | null;
  limit: number;
  offset: number;
};

export const inventoryApi = {
  overview: () => invFetch('/overview'),
  /** Every stock row (stock value and low/out are worked out from all rows). */
  stockAll: () => invFetch('/stock?all=1'),
  stock: (params?: URLSearchParams) =>
    invFetch(`/stock${params?.toString() ? `?${params}` : ''}`),
  stockKpis: () => invFetch('/stock/kpis'),
  items: (params?: URLSearchParams) =>
    invFetch(`/items${params?.toString() ? `?${params}` : ''}`),
  item: (id: string) => invFetch(`/items/${encodeURIComponent(id)}`),
  createItem: (body: unknown, idempotencyKey: string) =>
    invFetch('/items', {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(body),
    }),
  patchItem: (id: string, body: unknown) =>
    invFetch(`/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteItem: (id: string) =>
    invFetch(`/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  movements: (params?: URLSearchParams) =>
    invFetch(`/movements${params?.toString() ? `?${params}` : ''}`),
  receive: (body: unknown, idempotencyKey: string) =>
    invFetch('/receive', {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(body),
    }),
  issuePreview: (body: unknown) =>
    invFetch('/issue/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  issue: (body: unknown, idempotencyKey: string) =>
    invFetch('/issue', {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(body),
    }),
  kitsCompliance: (params?: URLSearchParams) =>
    invFetch(`/kits/compliance${params?.toString() ? `?${params}` : ''}`),
  kitsComplianceCsv: async () => {
    const res = await invFetchRaw('/kits/compliance.csv');
    const type = res.headers.get('content-type') || '';
    if (type.includes('text/csv')) return { kind: 'csv' as const, text: await res.text() };
    return { kind: 'json' as const, data: await res.json() };
  },
  kitsSpecPdf: async (templateId?: string) => {
    const qs = templateId ? `?template_id=${encodeURIComponent(templateId)}` : '';
    const res = await invFetchRaw(`/kits/spec.pdf${qs}`);
    const type = res.headers.get('content-type') || '';
    if (type.includes('application/pdf')) {
      return { kind: 'pdf' as const, blob: await res.blob() };
    }
    return { kind: 'json' as const, data: await res.json() };
  },
  returnStock: (body: unknown, idempotencyKey: string) =>
    invFetch('/return', {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(body),
    }),
  writeOff: (body: unknown, idempotencyKey: string) =>
    invFetch('/write-off', {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(body),
    }),
  transfer: (body: unknown, idempotencyKey: string) =>
    invFetch('/transfer', {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(body),
    }),
  adjust: (body: unknown, idempotencyKey: string) =>
    invFetch('/adjust', {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(body),
    }),
  exportCsv: () => invFetchRaw('/export.csv').then((r) => r.text()),
  reverseMovement: (body: unknown, idempotencyKey: string) =>
    invFetch('/reverse', {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(body),
    }),
  alerts: () => invFetch('/alerts'),
  alertSnooze: (id: string, body: { days?: number; until?: string; reason?: string; assignee?: string }) =>
    invFetch(`/alerts/${encodeURIComponent(id)}/snooze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  alertDone: (id: string) =>
    invFetch(`/alerts/${encodeURIComponent(id)}/done`, { method: 'POST' }),
  alertViewed: (id: string) =>
    invFetch(`/alerts/${encodeURIComponent(id)}/viewed`, { method: 'POST' }),
  alertAssign: (id: string, userId: string) =>
    invFetch(`/alerts/${encodeURIComponent(id)}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    }),
  assets: () => invFetch('/assets'),
  assetEvents: (id: string) => invFetch(`/assets/${encodeURIComponent(id)}/events`),
  assetAddEvent: (id: string, body: unknown) =>
    invFetch(`/assets/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  assetDocuments: (id: string) => invFetch(`/assets/${encodeURIComponent(id)}/documents`),
  assetAddDocument: (id: string, body: unknown) =>
    invFetch(`/assets/${encodeURIComponent(id)}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  assetMove: (id: string, body: unknown, idempotencyKey?: string) =>
    invFetch(`/assets/${encodeURIComponent(id)}/move`, {
      method: 'POST',
      headers: idempotencyKey
        ? idempotencyHeaders(idempotencyKey)
        : { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  assetCondition: (id: string, body: unknown) =>
    invFetch(`/assets/${encodeURIComponent(id)}/condition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  assetRepair: (id: string, body: unknown = {}) =>
    invFetch(`/assets/${encodeURIComponent(id)}/repair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  assetNextInspection: (id: string, body: unknown) =>
    invFetch(`/assets/${encodeURIComponent(id)}/next-inspection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  assetFaulty: (id: string, body: unknown = {}) =>
    invFetch(`/assets/${encodeURIComponent(id)}/faulty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  assetRetire: (id: string, body: unknown = {}) =>
    invFetch(`/assets/${encodeURIComponent(id)}/retire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  assetSerial: (id: string, serialNumber: string) =>
    invFetch(`/assets/${encodeURIComponent(id)}/serial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial_number: serialNumber }),
    }),
  carKit: () => invFetch('/driver/car-kit'),
  ledgerVerify: () =>
    invFetch('/ledger/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
  settings: () => invFetch('/settings'),
  updateSettings: (body: unknown) =>
    invFetch('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  alertRules: () => invFetch('/alert-rules'),
  updateAlertRules: (rules: unknown) =>
    invFetch('/alert-rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules }),
    }),
  categories: () => invFetch('/categories'),
  createCategory: (body: unknown) =>
    invFetch('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  patchCategory: (id: string, body: unknown) =>
    invFetch(`/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  locationsBins: () => invFetch('/locations'),
  createLocation: (body: unknown) =>
    invFetch('/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  patchLocation: (id: string, body: unknown) =>
    invFetch(`/locations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  importItems: (file: unknown) =>
    invFetch('/items/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    }),
  openingBalance: (body: unknown, idempotencyKey: string) =>
    invFetch('/opening-balance', {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(body),
    }),
  registerAsset: (body: unknown) =>
    invFetch('/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  kitsCompare: (params?: URLSearchParams) =>
    invFetch(`/kits/compare${params?.toString() ? `?${params}` : ''}`),
  kitsTemplates: () => invFetch('/kits/templates'),
  createKitTemplate: (body: unknown) =>
    invFetch('/kits/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  publishKitTemplate: (templateId: string, body: unknown) =>
    invFetch(`/kits/templates/${encodeURIComponent(templateId)}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  saveKitTemplateDraft: (templateId: string, body: unknown) =>
    invFetch(`/kits/templates/${encodeURIComponent(templateId)}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  driverReportUpdate: (id: string, body: unknown, idempotencyKey: string) =>
    invFetch(`/driver/reports/${encodeURIComponent(id)}/updates`, {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(body),
    }),
  resolveDriverReport: (id: string, body: unknown) =>
    invFetch(`/driver/reports/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  driverReports: (params?: URLSearchParams) =>
    invFetch(`/driver/reports${params?.toString() ? `?${params}` : ''}`),
  /** Fleet view of one driver report + its real timeline. */
  driverReport: (id: string) => invFetch(`/driver-reports/${encodeURIComponent(id)}`),
};
