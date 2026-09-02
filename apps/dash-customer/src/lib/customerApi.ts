import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import type { NotificationPrefs } from '@/lib/accountSubContent';

/** Mirrors delivery.customers.saved_addresses jsonb entries */
export type CustomerSavedAddressDto = {
  id: string;
  label: 'home' | 'work' | 'other';
  line1: string;
  line2?: string;
  instructions?: string;
  city?: string;
  isDefault?: boolean;
  lat?: number;
  lng?: number;
};

export type CustomerProfileDto = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  email: string | null;
  defaultAddress: string | null;
  savedAddresses: CustomerSavedAddressDto[];
  accountStatus: string;
  notificationPrefs?: NotificationPrefs;
  preferredPaymentMethod?: 'wipay' | 'cash';
  avatarUrl?: string | null;
};

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchCustomerProfile(): Promise<CustomerProfileDto | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/profile`, { headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load profile');
  const data = await res.json();
  return data.profile as CustomerProfileDto;
}

export async function patchCustomerProfile(body: {
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  email?: string;
  savedAddresses?: CustomerSavedAddressDto[];
  notificationPrefs?: NotificationPrefs;
  preferredPaymentMethod?: 'wipay' | 'cash';
}): Promise<CustomerProfileDto> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/profile`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save profile');
  const data = await res.json();
  return data.profile as CustomerProfileDto;
}

export async function uploadCustomerAvatar(file: File): Promise<CustomerProfileDto> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in required');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update photo');
  const data = await res.json();
  return data.profile as CustomerProfileDto;
}

export async function getAuthAvatarHint(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  for (const key of ['avatar_url', 'picture', 'avatar'] as const) {
    const value = meta[key];
    if (typeof value === 'string' && value.startsWith('http')) return value;
  }
  return null;
}

export async function fetchFavoriteMerchantIds(): Promise<string[]> {
  const headers = await authHeaders();
  if (!headers) return [];
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/favorites`, { headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load favorites');
  const data = await res.json();
  return (data.merchantIds as string[]) ?? [];
}

export async function addFavoriteMerchant(merchantId: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/favorites`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ merchantId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to add favorite');
}

export async function removeFavoriteMerchant(merchantId: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/favorites/${encodeURIComponent(merchantId)}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to remove favorite');
}

export type FavoriteItemDto = {
  merchantId: string;
  menuItemId: string;
};

export async function fetchFavoriteItems(): Promise<FavoriteItemDto[]> {
  const headers = await authHeaders();
  if (!headers) return [];
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/favorite-items`, { headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load favorite items');
  const data = await res.json();
  return (data.items as FavoriteItemDto[]) ?? [];
}

export async function addFavoriteItem(merchantId: string, menuItemId: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/favorite-items`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ merchantId, menuItemId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to add favorite item');
}

export async function removeFavoriteItem(merchantId: string, menuItemId: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(
    `${API_ENDPOINTS.delivery}/customer/favorite-items/${encodeURIComponent(merchantId)}/${encodeURIComponent(menuItemId)}`,
    { method: 'DELETE', headers },
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to remove favorite item');
}

export async function isCustomerLoggedIn(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return Boolean(session?.access_token);
}

export async function fetchCustomerOrders(): Promise<{
  orders: Array<{
    id: string;
    order_number?: string;
    status: string;
    merchant?: { id?: string; name?: string; logo_url?: string };
    [key: string]: unknown;
  }>;
}> {
  const headers = await authHeaders();
  if (!headers) return { orders: [] };
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/orders`, { headers });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export type IssueSubmissionResult = {
  issue: { id: string; order_id: string; issue_type: string; status: string; created_at: string };
  case?: { id: string } | null;
  dispute?: { id: string } | null;
  resolution?: {
    status: string;
    message: string;
    refundAmount?: number;
    caseId?: string;
    autoResolved?: boolean;
  };
};

export async function submitCustomerOrderIssue(input: {
  orderId: string;
  issueType: string;
  notes: string;
  photoPath?: string;
}): Promise<IssueSubmissionResult> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${input.orderId}/issue`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      issueType: input.issueType,
      notes: input.notes,
      photoPath: input.photoPath || undefined,
    }),
  });
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error || 'Could not submit report');
  }
  return res.json() as Promise<IssueSubmissionResult>;
}

export type CustomerSupportCase = {
  id: string;
  subject: string;
  status: string;
  priority?: string;
  order_id?: string;
  fault_attribution?: string;
  resolution_action?: string;
  auto_resolved?: boolean;
  created_at: string;
  updated_at?: string;
};

export async function fetchCustomerSupportCases(): Promise<CustomerSupportCase[]> {
  const headers = await authHeaders();
  if (!headers) return [];
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/support/cases`, { headers });
  if (!res.ok) throw new Error('Failed to load support cases');
  const data = await res.json() as { cases: CustomerSupportCase[] };
  return data.cases ?? [];
}

export async function fetchCustomerSupportCaseDetail(caseId: string) {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/support/cases/${caseId}`, { headers });
  if (!res.ok) throw new Error('Failed to load case');
  return res.json() as Promise<{
    case: CustomerSupportCase;
    timeline: Array<{ status: string; notes?: string; created_at: string }>;
    dispute: { status: string; refund_amount?: number } | null;
  }>;
}

export async function uploadCustomerIssuePhoto(file: File): Promise<{ path: string; signedUrl: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in required');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_ENDPOINTS.delivery}/customer/issue-photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to attach photo');
  const data = await res.json();
  return { path: String(data.path), signedUrl: String(data.signedUrl) };
}

export async function toggleReviewHelpful(merchantId: string, orderId: string): Promise<{ voted: boolean; helpfulCount: number }> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(
    `${API_ENDPOINTS.delivery}/merchants/${encodeURIComponent(merchantId)}/reviews/${encodeURIComponent(orderId)}/helpful`,
    { method: 'POST', headers },
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save vote');
  return res.json() as Promise<{ voted: boolean; helpfulCount: number }>;
}

export async function reportMerchantReview(merchantId: string, orderId: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Sign in required');
  const res = await fetch(
    `${API_ENDPOINTS.delivery}/merchants/${encodeURIComponent(merchantId)}/reviews/${encodeURIComponent(orderId)}/report`,
    { method: 'POST', headers, body: JSON.stringify({ reason: 'Inappropriate review' }) },
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not report review');
}
