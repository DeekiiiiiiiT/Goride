import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type {
  MerchantApplicationPayload,
  MerchantBankAccountInput,
  MerchantBankAccountMasked,
  MerchantDocument,
} from '@roam/types';

export async function getAuthHeaders(contentType = 'application/json') {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

export async function deliveryFetch(path: string, init?: RequestInit) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_ENDPOINTS.delivery}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface ApplicationStatusResponse {
  hasMerchant: boolean;
  merchant?: {
    id: string;
    verification_status: string;
    verification_notes?: string | null;
    rejection_reason?: string | null;
  };
  checklist: {
    profileComplete: boolean;
    documentsComplete: boolean;
    bankComplete: boolean;
    hoursComplete: boolean;
    menuComplete: boolean;
  };
  documents?: MerchantDocument[];
}

export async function fetchApplicationStatus(): Promise<ApplicationStatusResponse> {
  return deliveryFetch('/merchant/application-status') as Promise<ApplicationStatusResponse>;
}

export async function submitMerchantApplication(payload: MerchantApplicationPayload) {
  return deliveryFetch('/merchants', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchMerchantDocuments(): Promise<{ documents: MerchantDocument[] }> {
  return deliveryFetch('/merchant/documents') as Promise<{ documents: MerchantDocument[] }>;
}

export async function uploadMerchantDocument(
  docType: 'id_front' | 'id_back' | 'proof_of_business',
  file: File,
): Promise<{ document: MerchantDocument }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const form = new FormData();
  form.append('file', file);
  form.append('docType', docType);

  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Upload failed');
  }
  return res.json();
}

export async function saveBankAccount(input: MerchantBankAccountInput): Promise<{ bankAccount: MerchantBankAccountMasked }> {
  return deliveryFetch('/merchant/bank-account', {
    method: 'POST',
    body: JSON.stringify(input),
  }) as Promise<{ bankAccount: MerchantBankAccountMasked }>;
}

export async function fetchBankAccount(): Promise<{ bankAccount: MerchantBankAccountMasked | null }> {
  return deliveryFetch('/merchant/bank-account') as Promise<{ bankAccount: MerchantBankAccountMasked | null }>;
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

export async function saveMerchantHours(merchantId: string, hours: Array<{
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}>) {
  return deliveryFetch(`/merchants/${merchantId}/hours`, {
    method: 'POST',
    body: JSON.stringify({ hours }),
  });
}
