/**
 * Dash Admin Service - API client for merchant verification and management
 */

import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';

const DELIVERY_BASE = API_ENDPOINTS.delivery;

export type MerchantVerificationStatus =
  | 'pending'
  | 'in_review'
  | 'docs_requested'
  | 'approved'
  | 'rejected';

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
  verification_notes: string | null;
  rejection_reason: string | null;
  verified_at: string | null;
  verified_by: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string | null;
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

export interface ListMerchantsResponse {
  merchants: DashMerchant[];
  total: number;
  page: number;
  limit: number;
  counts: MerchantStatusCounts;
}

export interface MerchantDetailResponse {
  merchant: DashMerchant;
  hours: MerchantHours[];
  auditLog: MerchantAuditEntry[];
  ownerEmail: string;
  documents?: MerchantDocumentDetail[];
  bankAccount?: MerchantBankAccountDetail | null;
}

export interface MerchantDocumentDetail {
  id: string;
  doc_type: string;
  status: string;
  file_path: string;
  signedUrl?: string | null;
  uploaded_at: string;
}

export interface MerchantBankAccountDetail {
  bank_name: string;
  account_holder_name: string;
  account_last4: string;
  account_type: string;
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
    throw new Error(
      'Server returned HTML instead of JSON. Check that the delivery Edge function is deployed and API env vars are set.'
    );
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

export async function listMerchants(
  accessToken: string,
  opts: {
    status?: MerchantVerificationStatus | 'all';
    search?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<ListMerchantsResponse> {
  const sp = new URLSearchParams();
  if (opts.status) sp.set('status', opts.status);
  if (opts.search) sp.set('search', opts.search);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));

  const res = await fetch(`${DELIVERY_BASE}/admin/merchants?${sp.toString()}`, {
    headers: headers(accessToken),
  });

  return parseJsonResponse<ListMerchantsResponse>(res);
}

export async function getMerchantDetail(
  accessToken: string,
  id: string
): Promise<MerchantDetailResponse> {
  const res = await fetch(`${DELIVERY_BASE}/admin/merchants/${id}`, {
    headers: headers(accessToken),
  });

  return parseJsonResponse<MerchantDetailResponse>(res);
}

export async function changeMerchantStatus(
  accessToken: string,
  id: string,
  payload: {
    status: MerchantVerificationStatus;
    notes?: string;
    internal_notes?: string;
  }
): Promise<{ merchant: DashMerchant }> {
  const res = await fetch(`${DELIVERY_BASE}/admin/merchants/${id}/status`, {
    method: 'POST',
    headers: headers(accessToken, 'application/json'),
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<{ merchant: DashMerchant }>(res);
}

export async function getMerchantStats(
  accessToken: string
): Promise<{ counts: MerchantStatusCounts; total: number }> {
  const res = await fetch(`${DELIVERY_BASE}/admin/merchants/stats`, {
    headers: headers(accessToken),
  });

  return parseJsonResponse<{ counts: MerchantStatusCounts; total: number }>(res);
}
