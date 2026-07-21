/**
 * Expense Hub client — Business Finance writes/reads.
 * Legacy vehicle fixed expenses remain on expenseService.
 */
import { requireAuthHeaders } from '../utils/authHeaders';
import { API_ENDPOINTS } from './apiConfig';
import type {
  ExpenseBulkPreview,
  ExpenseDocument,
  ExpenseHubSummary,
  ExpensePayment,
  ExpenseRuleAssignment,
  ExpenseRuleGroup,
  ExpenseVendor,
} from '../types/expenseHub';

const BASE = `${API_ENDPOINTS.financial}/expense-hub`;

async function hubFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(await requireAuthHeaders(init?.body ? undefined : null)),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Expense Hub request failed (${response.status})`);
  }
  return payload as T;
}

export const expenseHubService = {
  getFlag() {
    return hubFetch<{ flag: string; enabled: boolean; organizationId: string | null }>('/flag');
  },

  getSummary(startYmd: string, endYmd: string) {
    return hubFetch<ExpenseHubSummary>(
      `/summary?startYmd=${encodeURIComponent(startYmd)}&endYmd=${encodeURIComponent(endYmd)}`,
    );
  },

  listDocuments(params: {
    status?: string;
    vehicleId?: string;
    q?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.vehicleId) qs.set('vehicleId', params.vehicleId);
    if (params.q) qs.set('q', params.q);
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return hubFetch<{ items: ExpenseDocument[]; total: number }>(`/documents${q ? `?${q}` : ''}`);
  },

  getDocument(id: string) {
    return hubFetch<{
      document: ExpenseDocument;
      payments: ExpensePayment[];
      journals: unknown[];
      audits: unknown[];
    }>(`/documents/${id}`);
  },

  createDocument(body: Record<string, unknown>) {
    return hubFetch<{ success: boolean; data: ExpenseDocument }>('/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  submitDocument(id: string) {
    return hubFetch<{ success: boolean; data: ExpenseDocument }>(`/documents/${id}/submit`, {
      method: 'POST',
      body: '{}',
    });
  },

  approveDocument(id: string, allowSelfApprove = false) {
    return hubFetch<{ success: boolean; data: ExpenseDocument }>(`/documents/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ allowSelfApprove }),
    });
  },

  rejectDocument(id: string, reason: string) {
    return hubFetch<{ success: boolean; data: ExpenseDocument }>(`/documents/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  recordPayment(
    id: string,
    body: { amount: number; paymentDate?: string; paymentMethod?: string; reference?: string },
  ) {
    return hubFetch<{ success: boolean; data: ExpenseDocument; payment: ExpensePayment }>(
      `/documents/${id}/payments`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  voidDocument(id: string, reason: string) {
    return hubFetch<{ success: boolean; data: ExpenseDocument }>(`/documents/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  listRules() {
    return hubFetch<{ items: Array<ExpenseRuleGroup & { assignmentCount: number }> }>('/rules');
  },

  getRule(id: string) {
    return hubFetch<{ group: ExpenseRuleGroup; assignments: ExpenseRuleAssignment[] }>(`/rules/${id}`);
  },

  previewRule(body: Record<string, unknown>) {
    return hubFetch<ExpenseBulkPreview>('/rules/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  createRule(body: Record<string, unknown>) {
    return hubFetch<{
      success: boolean;
      group: ExpenseRuleGroup;
      assignments: ExpenseRuleAssignment[];
    }>('/rules', { method: 'POST', body: JSON.stringify(body) });
  },

  bulkRuleAction(id: string, body: Record<string, unknown>) {
    return hubFetch<{ success: boolean; group: ExpenseRuleGroup; affected: number }>(
      `/rules/${id}/bulk`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  listVendors() {
    return hubFetch<{ items: ExpenseVendor[] }>('/vendors');
  },

  createVendor(body: { name: string; categoryDefault?: string; notes?: string }) {
    return hubFetch<{ success: boolean; data: ExpenseVendor }>('/vendors', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  migrateDryRun() {
    return hubFetch<Record<string, unknown>>('/migrate/dry-run', { method: 'POST', body: '{}' });
  },

  migrateApply() {
    return hubFetch<Record<string, unknown>>('/migrate/apply', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  },

  shadowCompare() {
    return hubFetch<Record<string, unknown>>('/migrate/shadow-compare', {
      method: 'POST',
      body: '{}',
    });
  },
};
