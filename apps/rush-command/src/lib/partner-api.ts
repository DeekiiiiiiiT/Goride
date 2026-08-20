/** Command HTTP + team helpers — auth via initCommandMerchantOps(). */
export {
  deliveryFetch,
  getStationAuthHeaders,
  getAuthHeaders,
  deliveryFetchWithShift,
} from '@roam/merchant-ops';
export * from '@roam/merchant-ops/station-api';

import { deliveryFetch, endShift as endShiftApi } from '@roam/merchant-ops';

export async function endShift(merchantId: string) {
  const { readShift, resolveShiftSurface } = await import('./station-shift-session');
  const shift = readShift(merchantId, resolveShiftSurface());
  return endShiftApi(merchantId, shift?.token);
}

export async function fetchNotificationSettings(): Promise<{ settings: Record<string, unknown> }> {
  return deliveryFetch('/merchant/notification-settings') as Promise<{ settings: Record<string, unknown> }>;
}

export async function saveNotificationSettings(settings: Record<string, unknown>) {
  return deliveryFetch('/merchant/notification-settings', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

export function fetchMerchantSettings(): Promise<{
  settings: {
    allows_pickup: boolean;
    allows_scheduled: boolean;
    allows_doubledash: boolean;
  };
}> {
  return deliveryFetch('/merchant/settings') as Promise<{
    settings: {
      allows_pickup: boolean;
      allows_scheduled: boolean;
      allows_doubledash: boolean;
    };
  }>;
}

export function saveMerchantSettings(settings: {
  allows_pickup?: boolean;
  allows_scheduled?: boolean;
  allows_doubledash?: boolean;
}) {
  return deliveryFetch('/merchant/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function fetchBankAccount(): Promise<{ bankAccount: Record<string, unknown> | null }> {
  return deliveryFetch('/merchant/bank-account') as Promise<{ bankAccount: Record<string, unknown> | null }>;
}

export async function saveBankAccount(input: Record<string, unknown>) {
  return deliveryFetch('/merchant/bank-account', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function uploadMerchantAsset(
  file: File | Blob,
  folder = 'images',
  originalName = 'image.jpg',
): Promise<{ publicUrl: string; path: string }> {
  const { getAuthHeaders } = await import('@roam/merchant-ops');
  const { API_ENDPOINTS, supabaseAnonFunctionHeaders } = await import('@roam/api-client');
  const { supabase } = await import('./command-supabase');
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const form = new FormData();
  const asFile =
    file instanceof File ? file : new File([file], originalName, { type: (file as Blob).type || 'image/jpeg' });
  form.append('file', asFile);
  form.append('folder', folder);

  const headers = await getAuthHeaders('');
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant-assets/upload`, {
    method: 'POST',
    headers: {
      ...supabaseAnonFunctionHeaders(),
      Authorization: headers.Authorization ?? `Bearer ${session.access_token}`,
    },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Upload failed');
  }
  return res.json();
}

export interface ApplicationStatusResponse {
  hasMerchant: boolean;
  merchant?: Record<string, unknown>;
  checklist: Record<string, boolean>;
}

export async function fetchApplicationStatus(): Promise<ApplicationStatusResponse> {
  return deliveryFetch('/merchant/application-status') as Promise<ApplicationStatusResponse>;
}

export interface PendingTeamInviteSummary {
  id: string;
  token: string;
  merchantName: string;
  role: string;
  expiresAt?: string;
}

export async function fetchTeamInvitePreview(token: string) {
  const { API_ENDPOINTS, supabaseAnonFunctionHeaders } = await import('@roam/api-client');
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/team/invites/preview/${token}`, {
    headers: supabaseAnonFunctionHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed: ${res.status}`);
  return body;
}

export async function acceptTeamInviteByToken(token: string) {
  return deliveryFetch(`/merchant/team/invites/token/${token}/accept`, { method: 'POST', body: '{}' });
}
