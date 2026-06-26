import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type { MerchantDocumentType } from '@roam/types';
import type {
  MerchantApplicationPayload,
  MerchantBankAccountInput,
  MerchantBankAccountMasked,
  MerchantDocument,
} from '@roam/types';
import type { JobStation, RosterMember } from '../types/team';
import { readShift } from './station-shift-session';

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
    go_live_rule?: string | null;
    vertical_type?: string | null;
  };
  checklist: {
    profileComplete: boolean;
    documentsComplete: boolean;
    bankComplete: boolean;
    hoursComplete: boolean;
    menuComplete: boolean;
    catalogComplete: boolean;
  };
  reviewChecklist?: {
    profileComplete: boolean;
    documentsComplete: boolean;
    hoursComplete: boolean;
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
  docType: MerchantDocumentType,
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

export interface BootstrapMerchantResponse {
  merchant: Record<string, unknown>;
  created: boolean;
}

export class PendingTeamInviteError extends Error {
  inviteToken: string;

  constructor(inviteToken: string) {
    super('pending_team_invite');
    this.name = 'PendingTeamInviteError';
    this.inviteToken = inviteToken;
  }
}

export async function bootstrapPartnerMerchant(): Promise<BootstrapMerchantResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_ENDPOINTS.delivery}/partner/bootstrap`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 409 && body.error === 'pending_team_invite' && body.inviteToken) {
    throw new PendingTeamInviteError(String(body.inviteToken));
  }
  if (!res.ok) {
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return body as BootstrapMerchantResponse;
}

export interface PendingTeamInviteSummary {
  id: string;
  token: string;
  merchantName: string;
  role: string;
  expiresAt?: string;
}

export interface TeamInvitePreviewData {
  merchantName: string;
  role: string;
  permissions: string[];
  inviteeEmailMasked: string;
  expiresAt?: string;
  isExpired: boolean;
}

export interface PendingTeamInvite {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  token: string;
  expiresAt?: string;
  merchantName: string;
}

export async function fetchTeamInvitePreview(token: string): Promise<{ invite: TeamInvitePreviewData }> {
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/team/invites/preview/${token}`, {
    headers: supabaseAnonFunctionHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return body as { invite: TeamInvitePreviewData };
}

export async function fetchPendingTeamInvites(): Promise<{ invites: PendingTeamInvite[] }> {
  return deliveryFetch('/merchant/team/invites/pending') as Promise<{ invites: PendingTeamInvite[] }>;
}

export async function acceptTeamInvite(inviteId: string) {
  return deliveryFetch(`/merchant/team/invites/${inviteId}/accept`, { method: 'POST', body: '{}' });
}

export async function acceptTeamInviteByToken(token: string) {
  return deliveryFetch(`/merchant/team/invites/token/${token}/accept`, { method: 'POST', body: '{}' });
}

export async function declineTeamInvite(inviteId: string) {
  return deliveryFetch(`/merchant/team/invites/${inviteId}/decline`, { method: 'POST', body: '{}' });
}

export async function resendTeamInvite(inviteId: string) {
  return deliveryFetch(`/merchant/team/invites/${inviteId}/resend`, { method: 'POST', body: '{}' });
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

export function importMerchantCatalog(
  merchantId: string,
  items: Array<Record<string, unknown>>,
) {
  return deliveryFetch(`/merchants/${merchantId}/catalog/import`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export function saveOnboardingDraft(opts: {
  wizardStepKey: string;
  wizardStep?: number;
  draft: Record<string, unknown>;
}): Promise<{ merchant: Record<string, unknown> }> {
  return deliveryFetch('/partner/onboarding-draft', {
    method: 'PATCH',
    body: JSON.stringify(opts),
  });
}

export async function deliveryFetchWithShift(
  merchantId: string,
  path: string,
  init?: RequestInit,
) {
  const headers = await getAuthHeaders();
  const shift = readShift(merchantId);
  const merged: Record<string, string> = { ...headers, ...(init?.headers as Record<string, string>) };
  if (shift?.token) merged['X-Staff-Shift-Token'] = shift.token;
  const res = await fetch(`${API_ENDPOINTS.delivery}${path}`, {
    ...init,
    headers: merged,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function createRosterMember(payload: {
  name: string;
  jobStation: JobStation;
}) {
  return deliveryFetch('/merchant/team/members/roster', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resetMemberPin(memberId: string) {
  return deliveryFetch(`/merchant/team/members/${memberId}/pin-reset`, {
    method: 'POST',
    body: '{}',
  });
}

export async function fetchStationRoster(): Promise<{ members: RosterMember[] }> {
  return deliveryFetch('/merchant/station/roster') as Promise<{ members: RosterMember[] }>;
}

export async function createStaffPin(payload: {
  memberId: string;
  pin: string;
  confirmPin: string;
}): Promise<{ shiftToken: string; expiresAt: string; member: RosterMember }> {
  return deliveryFetch('/merchant/station/pin/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ shiftToken: string; expiresAt: string; member: RosterMember }>;
}

export async function verifyStaffPin(payload: {
  memberId: string;
  pin: string;
}): Promise<{ shiftToken: string; expiresAt: string; member: RosterMember }> {
  return deliveryFetch('/merchant/station/pin/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ shiftToken: string; expiresAt: string; member: RosterMember }>;
}

export async function endShift(merchantId: string) {
  return deliveryFetchWithShift(merchantId, '/merchant/station/shift/end', {
    method: 'POST',
    body: '{}',
  });
}
