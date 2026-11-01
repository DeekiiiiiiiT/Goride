import { API_ENDPOINTS } from '@roam/api-client';
import { fetchWithRetry } from '../../services/api';
import { getHeaders } from '../../utils/authHeaders';

const BASE = `${API_ENDPOINTS.fleetCore}/inventory`;

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
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Inventory API ${response.status}`);
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
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Inventory API ${response.status}`);
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
  stock: (params?: URLSearchParams) =>
    invFetch(`/stock${params?.toString() ? `?${params}` : ''}`),
  stockKpis: () => invFetch('/stock/kpis'),
  items: (params?: URLSearchParams) =>
    invFetch(`/items${params?.toString() ? `?${params}` : ''}`),
  item: (id: string) => invFetch(`/items/${encodeURIComponent(id)}`),
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
  alerts: () => invFetch('/alerts'),
  alertSnooze: (id: string, body: { days?: number; until?: string }) =>
    invFetch(`/alerts/${encodeURIComponent(id)}/snooze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  alertDone: (id: string) =>
    invFetch(`/alerts/${encodeURIComponent(id)}/done`, { method: 'POST' }),
  alertViewed: (id: string) =>
    invFetch(`/alerts/${encodeURIComponent(id)}/viewed`, { method: 'POST' }),
  assets: () => invFetch('/assets'),
  assetEvents: (id: string) => invFetch(`/assets/${encodeURIComponent(id)}/events`),
  assetDocuments: (id: string) => invFetch(`/assets/${encodeURIComponent(id)}/documents`),
  assetAddDocument: (id: string, body: unknown) =>
    invFetch(`/assets/${encodeURIComponent(id)}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  assetMove: (id: string, body: unknown) =>
    invFetch(`/assets/${encodeURIComponent(id)}/move`, {
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
  assetQrLabel: (id: string) =>
    invFetch(`/assets/${encodeURIComponent(id)}/qr-label`, { method: 'POST' }),
  purchaseOrders: () => invFetch('/purchase-orders'),
  poSubmit: (id: string) =>
    invFetch(`/purchase-orders/${encodeURIComponent(id)}/submit`, { method: 'POST' }),
  poAuthorize: (id: string) =>
    invFetch(`/purchase-orders/${encodeURIComponent(id)}/authorize`, { method: 'POST' }),
  poOrder: (id: string) =>
    invFetch(`/purchase-orders/${encodeURIComponent(id)}/order`, { method: 'POST' }),
  poReceive: (id: string, body: unknown, idempotencyKey: string) =>
    invFetch(`/purchase-orders/${encodeURIComponent(id)}/receive`, {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(body),
    }),
  poCancel: (id: string) =>
    invFetch(`/purchase-orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  countSessions: () => invFetch('/counts/sessions'),
  countSubmit: (id: string) =>
    invFetch(`/counts/${encodeURIComponent(id)}/submit`, { method: 'POST' }),
  countRecount: (id: string) =>
    invFetch(`/counts/${encodeURIComponent(id)}/recount`, { method: 'POST' }),
  countReject: (id: string, body: unknown = {}) =>
    invFetch(`/counts/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  countApprove: (id: string) =>
    invFetch(`/counts/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  scanners: () => invFetch('/scanners'),
  scannerPair: (body: unknown) =>
    invFetch('/scanners/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  financePost: (body: unknown = {}) =>
    invFetch('/finance/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  vendors: () => invFetch('/vendors'),
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
  createBin: (body: unknown) =>
    invFetch('/bins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  patchBin: (id: string, body: unknown) =>
    invFetch(`/bins/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  createVendor: (body: unknown) =>
    invFetch('/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  patchVendor: (id: string, body: unknown) =>
    invFetch(`/vendors/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  vendorStats: () => invFetch('/analytics/vendor-stats'),
  createPurchaseOrder: (body: unknown) =>
    invFetch('/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  patchPurchaseOrder: (id: string, body: unknown) =>
    invFetch(`/purchase-orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  startCountSession: (body: unknown) =>
    invFetch('/counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  saveCountLines: (id: string, lines: unknown[]) =>
    invFetch(`/counts/${encodeURIComponent(id)}/lines`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    }),
  approvals: (status = 'pending') => invFetch(`/approvals?status=${encodeURIComponent(status)}`),
  approveApproval: (id: string) =>
    invFetch(`/approvals/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  rejectApproval: (id: string) =>
    invFetch(`/approvals/${encodeURIComponent(id)}/reject`, { method: 'POST' }),
  requisitions: () => invFetch('/requisitions'),
  createRequisition: (body: unknown) =>
    invFetch('/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  approveRequisition: (id: string) =>
    invFetch(`/requisitions/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  rejectRequisition: (id: string) =>
    invFetch(`/requisitions/${encodeURIComponent(id)}/reject`, { method: 'POST' }),
  issueRequisition: (id: string) =>
    invFetch(`/requisitions/${encodeURIComponent(id)}/issue`, { method: 'POST' }),
  regenerateScanner: (id: string) =>
    invFetch(`/scanners/${encodeURIComponent(id)}/regenerate`, { method: 'POST' }),
  unpairScanner: (id: string) =>
    invFetch(`/scanners/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  alertRules: () => invFetch('/alert-rules'),
  updateAlertRules: (rules: unknown[]) =>
    invFetch('/alert-rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules }),
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
  resolveDriverReport: (id: string, body: unknown) =>
    invFetch(`/driver/reports/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
