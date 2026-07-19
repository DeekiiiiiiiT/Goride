import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { supabase, refreshPartnerSessionIfNeeded } from './partner-supabase';
import type { MerchantDocumentType } from '@roam/types';
import type {
  MerchantApplicationPayload,
  MerchantBankAccountInput,
  MerchantBankAccountMasked,
  MerchantDocument,
} from '@roam/types';
import type { JobStation, RosterMember, VenueStyle } from '../types/team';
import type { VenueOpsData, PrepStation } from './venue-ops-presets';
import { isStoreTabletContext } from './storeTabletUrl';
import { readShift, resolveShiftSurface } from './station-shift-session';
import { readDeviceSession } from './store-tablet-session';
import { TabletEnrollError } from './tablet-enroll-errors';
import { partnerFetch } from './partner-fetch';

export async function getAuthHeaders(contentType = 'application/json') {
  const session = await refreshPartnerSessionIfNeeded();
  const extra: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };
  if (contentType) extra['Content-Type'] = contentType;
  return supabaseAnonFunctionHeaders(extra);
}

export async function deliveryFetch(path: string, init?: RequestInit) {
  const request = async () => {
    const headers = await getAuthHeaders();
    return partnerFetch(`${API_ENDPOINTS.delivery}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers || {}),
      },
    });
  };

  let res = await request();
  if (res.status === 401) {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (!session) throw new Error('Session expired');
    res = await request();
  }

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
    headers: supabaseAnonFunctionHeaders({
      Authorization: `Bearer ${session.access_token}`,
    }),
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Upload failed');
  }
  return res.json();
}

/** Storefront images (logo/cover/menu) via Edge Function — not direct Storage writes. */
export async function uploadMerchantAsset(
  file: File | Blob,
  folder = 'images',
  originalName = 'image.jpg',
): Promise<{ publicUrl: string; path: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const form = new FormData();
  const asFile =
    file instanceof File ? file : new File([file], originalName, { type: (file as Blob).type || 'image/jpeg' });
  form.append('file', asFile);
  form.append('folder', folder);

  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant-assets/upload`, {
    method: 'POST',
    headers: supabaseAnonFunctionHeaders({
      Authorization: `Bearer ${session.access_token}`,
    }),
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
  const res = await partnerFetch(`${API_ENDPOINTS.delivery}/partner/bootstrap`, {
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
  if (res.status === 410 && body.invite) {
    return { invite: { ...body.invite, isExpired: true } as TeamInvitePreviewData };
  }
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

export async function getStationAuthHeaders(contentType = 'application/json') {
  const device = isStoreTabletContext() ? readDeviceSession() : null;
  if (device?.deviceToken) {
    return supabaseAnonFunctionHeaders({
      'X-Station-Device-Token': device.deviceToken,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    });
  }
  const authHeaders = await getAuthHeaders(contentType);
  return {
    ...supabaseAnonFunctionHeaders(),
    ...authHeaders,
  };
}

export async function deliveryFetchStation(path: string, init?: RequestInit) {
  const headers = await getStationAuthHeaders();
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

export interface StoreTabletPairingResponse {
  storeName: string;
  pairingCode: string;
  stationLinks: Partial<Record<JobStation, string>>;
  staffOperationsEnabled: boolean;
  staffStationPinEnabled: boolean;
}

export async function fetchVenueOps(): Promise<VenueOpsData> {
  const data = await deliveryFetch('/merchant/venue-ops') as { venueOps: VenueOpsData };
  return data.venueOps;
}

export async function patchVenueOps(payload: {
  venueStyle?: VenueStyle | null;
  enabledStations?: JobStation[];
}): Promise<VenueOpsData> {
  const data = await deliveryFetch('/merchant/venue-ops', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }) as { venueOps: VenueOpsData };
  return data.venueOps;
}

export async function applyVenueOpsTemplate(
  venueStyle: Exclude<VenueStyle, 'custom'>,
): Promise<VenueOpsData> {
  const data = await deliveryFetch('/merchant/venue-ops/apply-template', {
    method: 'POST',
    body: JSON.stringify({ venueStyle }),
  }) as { venueOps: VenueOpsData };
  return data.venueOps;
}

export async function fetchPrepStations(): Promise<PrepStation[]> {
  const data = await deliveryFetch('/merchant/venue-ops/prep-stations') as {
    prepStations: PrepStation[];
  };
  return data.prepStations;
}

export async function createPrepStation(payload: {
  name: string;
  sortOrder?: number;
}): Promise<PrepStation> {
  const data = await deliveryFetch('/merchant/venue-ops/prep-stations', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as { prepStation: PrepStation };
  return data.prepStation;
}

export async function updatePrepStation(
  id: string,
  payload: { name?: string; sortOrder?: number },
): Promise<PrepStation> {
  const data = await deliveryFetch(`/merchant/venue-ops/prep-stations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }) as { prepStation: PrepStation };
  return data.prepStation;
}

export async function deletePrepStation(id: string) {
  return deliveryFetch(`/merchant/venue-ops/prep-stations/${id}`, {
    method: 'DELETE',
  });
}

export async function getStoreTabletPairing(): Promise<StoreTabletPairingResponse> {
  return deliveryFetch('/merchant/station/pairing') as Promise<StoreTabletPairingResponse>;
}

export async function regeneratePairingCode(): Promise<StoreTabletPairingResponse> {
  return deliveryFetch('/merchant/station/pairing/regenerate', {
    method: 'POST',
    body: '{}',
  }) as Promise<StoreTabletPairingResponse>;
}

export async function updateStoreTabletFlags(flags: {
  staffOperationsEnabled?: boolean;
  staffStationPinEnabled?: boolean;
}): Promise<StoreTabletPairingResponse> {
  return deliveryFetch('/merchant/station/pairing/flags', {
    method: 'PATCH',
    body: JSON.stringify(flags),
  }) as Promise<StoreTabletPairingResponse>;
}

export interface EnrollStoreTabletResponse {
  deviceToken: string;
  expiresAt: string;
  merchantId: string;
  storeName: string;
  station: JobStation;
  prepStationId?: string | null;
  staffOperationsEnabled: boolean;
  staffStationPinEnabled: boolean;
  inStoreOperationsEnabled: boolean;
}

export async function enrollStoreTablet(payload: {
  code: string;
  station: JobStation;
  prepStationId?: string | null;
}): Promise<EnrollStoreTabletResponse> {
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/station/device/enroll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...supabaseAnonFunctionHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TabletEnrollError(
      body.error || `Request failed: ${res.status}`,
      String(body.code || 'ENROLL_FAILED'),
    );
  }
  return body;
}

export async function pingStoreTabletDevice(): Promise<StoreTabletPairingResponse & { station: JobStation }> {
  return deliveryFetchStation('/merchant/station/device/ping') as Promise<
    StoreTabletPairingResponse & { station: JobStation }
  >;
}

export async function revokeStoreTabletDevice() {
  const device = readDeviceSession();
  if (!device) return { ok: true };
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/station/device/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Station-Device-Token': device.deviceToken,
      ...supabaseAnonFunctionHeaders(),
    },
    body: '{}',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}
export async function deliveryFetchWithShift(
  merchantId: string,
  path: string,
  init?: RequestInit,
) {
  const headers = await getStationAuthHeaders();
  const shift = readShift(merchantId, resolveShiftSurface());
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
  role: 'staff' | 'manager';
  jobStation: JobStation | null;
  displayTitle?: string | null;
}) {
  return deliveryFetch('/merchant/team/members/roster', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      jobStation: payload.jobStation == null ? 'none' : payload.jobStation,
      displayTitle: payload.displayTitle ?? undefined,
    }),
  });
}

export async function resetMemberPin(memberId: string) {
  return deliveryFetch(`/merchant/team/members/${memberId}/pin-reset`, {
    method: 'POST',
    body: '{}',
  });
}

export async function fetchStationRoster(): Promise<{ members: RosterMember[] }> {
  return deliveryFetchStation('/merchant/station/roster') as Promise<{ members: RosterMember[] }>;
}

export async function createStaffPin(payload: {
  memberId: string;
  pin: string;
  confirmPin: string;
}): Promise<{ shiftToken: string; expiresAt: string; member: RosterMember }> {
  return deliveryFetchStation('/merchant/station/pin/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ shiftToken: string; expiresAt: string; member: RosterMember }>;
}

export async function verifyStaffPin(payload: {
  memberId: string;
  pin: string;
}): Promise<{ shiftToken: string; expiresAt: string; member: RosterMember }> {
  return deliveryFetchStation('/merchant/station/pin/verify', {
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
