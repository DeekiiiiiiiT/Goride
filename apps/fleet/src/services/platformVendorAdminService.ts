/**
 * Super Admin client for platform Jamaica vendor + category catalog.
 */
import { requireAuthHeaders } from '../utils/authHeaders';
import { API_ENDPOINTS } from './apiConfig';
import type { ExpenseHubCategory, ExpenseVendor } from '../types/expenseHub';

const V = `${API_ENDPOINTS.admin}/admin/platform-vendors`;
const C = `${API_ENDPOINTS.admin}/admin/platform-categories`;

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(await requireAuthHeaders(init?.body ? undefined : null)),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

export const platformVendorAdminService = {
  listVendors(status?: string) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return adminFetch<{ items: ExpenseVendor[] }>(`${V}${qs}`);
  },

  createVendor(body: {
    name: string;
    categoryDefault?: string;
    notes?: string;
  }) {
    return adminFetch<{ success: boolean; data: ExpenseVendor }>(V, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  bulkCreateVendors(body: { names?: string[]; text?: string; categoryDefault?: string; notes?: string }) {
    return adminFetch<{
      success: boolean;
      created: ExpenseVendor[];
      skipped: string[];
      summary: { created: number; skipped: number };
    }>(`${V}/bulk`, { method: 'POST', body: JSON.stringify(body) });
  },

  updateVendor(
    id: string,
    body: Partial<Pick<ExpenseVendor, 'name' | 'categoryDefault' | 'notes' | 'isActive' | 'status'>>,
  ) {
    return adminFetch<{ success: boolean; data: ExpenseVendor }>(`${V}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  deleteVendor(id: string) {
    return adminFetch<{ success: boolean; data: ExpenseVendor }>(`${V}/${id}`, {
      method: 'DELETE',
    });
  },

  approveVendor(id: string, body: { mergeIntoVendorId?: string; name?: string; notes?: string } = {}) {
    return adminFetch<{ success: boolean; data: ExpenseVendor }>(`${V}/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  rejectVendor(id: string) {
    return adminFetch<{ success: boolean; data: ExpenseVendor }>(`${V}/${id}/reject`, {
      method: 'POST',
      body: '{}',
    });
  },

  migrateLegacy(confirm = false) {
    return adminFetch<Record<string, unknown>>(`${V}/migrate-legacy`, {
      method: 'POST',
      body: JSON.stringify(confirm ? { confirm: true, dryRun: false } : { dryRun: true }),
    });
  },

  listCategories() {
    return adminFetch<{ items: ExpenseHubCategory[] }>(C);
  },

  createCategory(body: { label: string; value?: string; notes?: string }) {
    return adminFetch<{ success: boolean; data: ExpenseHubCategory }>(C, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  updateCategory(id: string, body: { label?: string; notes?: string; isActive?: boolean }) {
    return adminFetch<{ success: boolean; data: ExpenseHubCategory }>(`${C}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  deleteCategory(id: string) {
    return adminFetch<{ success: boolean; data: ExpenseHubCategory }>(`${C}/${id}`, {
      method: 'DELETE',
    });
  },
};
