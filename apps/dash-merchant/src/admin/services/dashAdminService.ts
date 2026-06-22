/**
 * Dash Admin Service - API client for Roam Dash admin portal
 */

import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import type {
  MerchantOperationalStatus,
  MerchantOnboardingStatus,
  MerchantVerificationStatus,
  PartnerWizardStepKey,
} from '@roam/types/delivery';

const DELIVERY_BASE = API_ENDPOINTS.delivery;

export type { MerchantVerificationStatus, MerchantOperationalStatus };

export interface DashMerchant {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  cuisine_type: string | null;
  is_active: boolean;
  is_verified: boolean;
  is_accepting_orders: boolean;
  avg_prep_time_mins: number | null;
  min_order_amount: number | null;
  delivery_fee: number | null;
  delivery_radius_km: number | null;
  commission_rate: number | null;
  rating: number | null;
  total_ratings: number | null;
  verification_status: MerchantVerificationStatus;
  operational_status?: MerchantOperationalStatus;
  verification_notes: string | null;
  rejection_reason: string | null;
  verified_at: string | null;
  verified_by: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string | null;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  admin_assigned_to?: string | null;
  verification_checklist?: Record<string, boolean>;
  admin_internal_notes?: string | null;
  onboarding_status?: MerchantOnboardingStatus;
  wizard_step?: number;
  wizard_step_key?: PartnerWizardStepKey | null;
  onboarding_draft?: Record<string, unknown>;
  last_onboarding_activity_at?: string | null;
  vertical_type?: string | null;
  fulfillment_type?: string | null;
  go_live_rule?: string | null;
  business_type_id?: string | null;
}

export interface MerchantHours {
  id: string;
  merchant_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

export interface MerchantAuditEntry {
  id: string;
  merchant_id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  notes: string | null;
  internal_notes: string | null;
  created_at: string;
}

export interface MerchantStatusCounts {
  pending: number;
  in_review: number;
  docs_requested: number;
  approved: number;
  rejected: number;
}

export interface MerchantTeamMemberRow {
  id: string;
  email: string | null;
  name: string;
  role: string;
  permissions: string[];
  is_owner: boolean;
}

export interface ListMerchantsResponse {
  merchants: DashMerchant[];
  total: number;
  page: number;
  limit: number;
  counts: MerchantStatusCounts;
  operational?: Record<MerchantOperationalStatus, number>;
}

export interface SetupChecklistSnapshot {
  profileComplete: boolean;
  documentsComplete: boolean;
  bankComplete: boolean;
  hoursComplete: boolean;
  menuComplete: boolean;
}

export interface IncompleteSetupRow {
  kind: 'draft' | 'merchant';
  userId: string;
  ownerEmail: string;
  merchantId: string | null;
  merchantName: string | null;
  verificationStatus: string | null;
  onboardingStatus?: MerchantOnboardingStatus | null;
  wizardStep?: number | null;
  wizardStepKey?: PartnerWizardStepKey | null;
  setupStage: string;
  checklist: SetupChecklistSnapshot | null;
  missingSteps: string[];
  lastActivityAt: string | null;
}

export interface ListIncompleteSetupResponse {
  items: IncompleteSetupRow[];
  total: number;
  page: number;
  limit: number;
  counts: {
    drafts: number;
    incomplete_merchants: number;
    total: number;
  };
}

export interface MerchantDetailResponse {
  merchant: DashMerchant;
  hours: MerchantHours[];
  auditLog: MerchantAuditEntry[];
  ownerEmail: string;
  documents?: MerchantDocumentDetail[];
  bankAccount?: MerchantBankAccountDetail | null;
  team?: MerchantTeamMemberRow[];
  pendingInvites?: Array<Record<string, unknown>>;
}

export interface MerchantDocumentDetail {
  id: string;
  doc_type: string;
  status: string;
  file_path: string;
  signedUrl?: string | null;
  uploaded_at: string;
  rejection_reason?: string | null;
}

export interface MerchantBankAccountDetail {
  bank_name: string;
  account_holder_name: string;
  account_last4: string;
  account_type: string;
}

export interface DashboardStats {
  merchants: {
    total: number;
    verification: MerchantStatusCounts;
    operational: Record<MerchantOperationalStatus, number>;
  };
  orders: { todayCount: number; todayGmv: number; liveCount: number };
  sla: { staleVerifications: number };
}

export interface DashOrderRow {
  id: string;
  order_number: string;
  status: string;
  total: number;
  placed_at: string;
  merchant_id: string;
  customer_id: string;
  delivery_address: string;
}

function headers(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    throw new Error('Server returned HTML instead of JSON. Check delivery Edge function deployment.');
  }
  let body: unknown;
  try {
    body = trimmed ? JSON.parse(trimmed) : {};
  } catch {
    throw new Error('Invalid JSON response from server');
  }
  if (!res.ok) {
    const err = body as { error?: string; message?: string };
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return body as T;
}

async function deliveryFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${DELIVERY_BASE}${path}`, {
    ...init,
    headers: { ...headers(accessToken, init?.body ? 'application/json' : undefined), ...init?.headers },
  });
  return parseJsonResponse<T>(res);
}

export function listMerchants(
  accessToken: string,
  opts: {
    status?: MerchantVerificationStatus | 'all';
    operational_status?: MerchantOperationalStatus | 'all';
    vertical_in?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<ListMerchantsResponse> {
  const sp = new URLSearchParams();
  if (opts.status) sp.set('status', opts.status);
  if (opts.operational_status) sp.set('operational_status', opts.operational_status);
  if (opts.vertical_in) sp.set('vertical_in', opts.vertical_in);
  if (opts.search) sp.set('search', opts.search);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  return deliveryFetch(accessToken, `/admin/merchants?${sp}`);
}

export function listIncompleteSetup(
  accessToken: string,
  opts: { q?: string; page?: number; limit?: number } = {},
): Promise<ListIncompleteSetupResponse> {
  const sp = new URLSearchParams();
  if (opts.q) sp.set('q', opts.q);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  return deliveryFetch(accessToken, `/admin/merchants/incomplete-setup?${sp}`);
}

export function getMerchantDetail(accessToken: string, id: string): Promise<MerchantDetailResponse> {
  return deliveryFetch(accessToken, `/admin/merchants/${id}`);
}

export function changeMerchantStatus(
  accessToken: string,
  id: string,
  payload: {
    status: MerchantVerificationStatus;
    notes?: string;
    internal_notes?: string;
    force?: boolean;
    commission_rate?: number;
    delivery_radius_km?: number;
  },
): Promise<{ merchant: DashMerchant }> {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/status`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getMerchantStats(
  accessToken: string,
): Promise<{ counts: MerchantStatusCounts; operational?: Record<string, number>; total: number }> {
  return deliveryFetch(accessToken, '/admin/merchants/stats');
}

export function getDashboardStats(accessToken: string): Promise<DashboardStats> {
  return deliveryFetch(accessToken, '/admin/dashboard/stats');
}

export function suspendMerchant(accessToken: string, id: string, reason: string) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function unsuspendMerchant(accessToken: string, id: string) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/unsuspend`, { method: 'POST' });
}

export function deactivateMerchant(accessToken: string, id: string, reason: string) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/deactivate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function reactivateMerchant(accessToken: string, id: string) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/reactivate`, { method: 'POST' });
}

export function deleteMerchant(
  accessToken: string,
  id: string,
  payload: { reason: string; confirm_name: string },
) {
  return deliveryFetch<{ ok: boolean; message: string }>(accessToken, `/admin/merchants/${id}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

export function patchMerchantOps(
  accessToken: string,
  id: string,
  payload: {
    is_accepting_orders?: boolean;
    commission_rate?: number;
    delivery_radius_km?: number;
    admin_internal_notes?: string;
  },
) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/ops`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function assignMerchant(accessToken: string, id: string, assignedTo: string | null) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ assigned_to: assignedTo }),
  });
}

export function updateMerchantChecklist(
  accessToken: string,
  id: string,
  checklist: Record<string, boolean>,
) {
  return deliveryFetch(accessToken, `/admin/merchants/${id}/checklist`, {
    method: 'PATCH',
    body: JSON.stringify({ checklist }),
  });
}

export function reviewMerchantDocument(
  accessToken: string,
  docId: string,
  payload: { status: string; rejection_reason?: string },
) {
  return deliveryFetch(accessToken, `/admin/merchants/documents/${docId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function listOrders(
  accessToken: string,
  opts: {
    status?: string;
    merchant_id?: string;
    q?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ orders: DashOrderRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.status) sp.set('status', opts.status);
  if (opts.merchant_id) sp.set('merchant_id', opts.merchant_id);
  if (opts.q) sp.set('q', opts.q);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  return deliveryFetch(accessToken, `/admin/orders?${sp}`);
}

export function getOrderDetail(
  accessToken: string,
  orderId: string,
): Promise<{ order: Record<string, unknown>; events: Array<Record<string, unknown>> }> {
  return deliveryFetch(accessToken, `/admin/orders/${orderId}`);
}

export function cancelOrder(accessToken: string, orderId: string, reason: string) {
  return deliveryFetch(accessToken, `/admin/orders/${orderId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function completeOrder(accessToken: string, orderId: string) {
  return deliveryFetch(accessToken, `/admin/orders/${orderId}/complete`, { method: 'POST' });
}

export function listCustomers(
  accessToken: string,
  opts: { q?: string; page?: number } = {},
) {
  const sp = new URLSearchParams();
  if (opts.q) sp.set('q', opts.q);
  if (opts.page) sp.set('page', String(opts.page));
  return deliveryFetch(accessToken, `/admin/customers?${sp}`);
}

export function getCustomerDetail(accessToken: string, id: string) {
  return deliveryFetch(accessToken, `/admin/customers/${id}`);
}

export function suspendCustomer(accessToken: string, id: string, reason: string) {
  return deliveryFetch(accessToken, `/admin/customers/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function unsuspendCustomer(accessToken: string, id: string) {
  return deliveryFetch(accessToken, `/admin/customers/${id}/unsuspend`, { method: 'POST' });
}

export function deleteCustomer(
  accessToken: string,
  id: string,
  payload: { reason: string; confirm_name: string },
) {
  return deliveryFetch<{ ok: boolean; message: string }>(accessToken, `/admin/customers/${id}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

export function listDashTeam(accessToken: string) {
  return deliveryFetch<{ members: Array<{ userId: string; email: string; role: string }> }>(
    accessToken,
    '/admin/team',
  );
}

export function removeDashTeamMember(
  accessToken: string,
  userId: string,
  payload?: { reason?: string },
) {
  return deliveryFetch<{ ok: boolean }>(accessToken, `/admin/team/${userId}`, {
    method: 'DELETE',
    body: JSON.stringify(payload ?? {}),
  });
}

export function listPayouts(accessToken: string, opts: { merchant_id?: string; status?: string } = {}) {
  const sp = new URLSearchParams();
  if (opts.merchant_id) sp.set('merchant_id', opts.merchant_id);
  if (opts.status) sp.set('status', opts.status);
  return deliveryFetch(accessToken, `/admin/finance/payouts?${sp}`);
}

export function listDisputes(accessToken: string, status?: string) {
  const sp = status ? `?status=${status}` : '';
  return deliveryFetch(accessToken, `/admin/finance/disputes${sp}`);
}

export function listReviews(accessToken: string, merchantId?: string) {
  const sp = merchantId ? `?merchant_id=${merchantId}` : '';
  return deliveryFetch(accessToken, `/admin/finance/reviews${sp}`);
}

export function hideReview(accessToken: string, orderId: string, hidden: boolean) {
  return deliveryFetch(accessToken, `/admin/finance/reviews/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ review_hidden: hidden }),
  });
}

export function listPromotions(accessToken: string, merchantId?: string) {
  const sp = merchantId ? `?merchant_id=${merchantId}` : '';
  return deliveryFetch(accessToken, `/admin/finance/promotions${sp}`);
}

export function listMerchantOwners(accessToken: string, q?: string, page = 1) {
  const sp = new URLSearchParams({ page: String(page) });
  if (q) sp.set('q', q);
  return deliveryFetch(accessToken, `/admin/merchant-owners?${sp}`);
}

import type { MerchantBusinessTypeConfig } from '@roam/types';

export type MerchantBusinessTypeDto = MerchantBusinessTypeConfig;

export interface MerchantBusinessTypeSectionDto {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  types: MerchantBusinessTypeDto[];
}

export function listMerchantBusinessTypes(accessToken: string) {
  return deliveryFetch<{ sections: MerchantBusinessTypeSectionDto[] }>(
    accessToken,
    '/admin/onboarding/business-types',
  );
}

export function createMerchantBusinessTypeSection(
  accessToken: string,
  body: { label: string; id?: string; sort_order?: number },
) {
  return deliveryFetch<{ section: MerchantBusinessTypeSectionDto }>(
    accessToken,
    '/admin/onboarding/business-type-sections',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function updateMerchantBusinessTypeSection(
  accessToken: string,
  id: string,
  body: Partial<Pick<MerchantBusinessTypeSectionDto, 'label' | 'sort_order' | 'is_active'>>,
) {
  return deliveryFetch<{ section: MerchantBusinessTypeSectionDto }>(
    accessToken,
    `/admin/onboarding/business-type-sections/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export function deleteMerchantBusinessTypeSection(accessToken: string, id: string) {
  return deliveryFetch<{ ok: boolean }>(
    accessToken,
    `/admin/onboarding/business-type-sections/${id}`,
    { method: 'DELETE' },
  );
}

export function createMerchantBusinessType(
  accessToken: string,
  body: {
    label: string;
    section_id: string;
    id?: string;
    sort_order?: number;
    vertical_type?: string;
    fulfillment_type?: string;
    category_taxonomy_key?: string;
    default_prep_time_mins?: number;
    max_delivery_radius_km?: number;
    compliance_tier?: string;
    go_live_rule?: string;
    required_document_types?: string[];
  },
) {
  return deliveryFetch<{ type: MerchantBusinessTypeDto }>(
    accessToken,
    '/admin/onboarding/business-types',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function updateMerchantBusinessType(
  accessToken: string,
  id: string,
  body: Partial<MerchantBusinessTypeDto>,
) {
  return deliveryFetch<{ type: MerchantBusinessTypeDto }>(
    accessToken,
    `/admin/onboarding/business-types/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export function deleteMerchantBusinessType(accessToken: string, id: string) {
  return deliveryFetch<{ ok: boolean }>(
    accessToken,
    `/admin/onboarding/business-types/${id}`,
    { method: 'DELETE' },
  );
}
