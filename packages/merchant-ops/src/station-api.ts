import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import {
  deliveryFetch,
  deliveryFetchStation,
  deliveryFetchWithShift,
} from './auth';
import type { JobStation, RosterMember, VenueStyle } from './types/team';
import type { VenueOpsData, PrepStation } from './venue-ops-presets';
import { TabletEnrollError } from './tablet-enroll-errors';
import { readDeviceSession } from './store-tablet-session';

export interface StoreTabletPairingResponse {
  storeName: string;
  pairingCode: string;
  stationLinks: Partial<Record<JobStation, string>>;
  staffOperationsEnabled: boolean;
  staffStationPinEnabled: boolean;
}

export async function fetchVenueOps(): Promise<VenueOpsData> {
  const data = (await deliveryFetch('/merchant/venue-ops')) as { venueOps: VenueOpsData };
  return data.venueOps;
}

export async function patchVenueOps(payload: {
  venueStyle?: VenueStyle | null;
  enabledStations?: JobStation[];
}): Promise<VenueOpsData> {
  const data = (await deliveryFetch('/merchant/venue-ops', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })) as { venueOps: VenueOpsData };
  return data.venueOps;
}

export async function applyVenueOpsTemplate(
  venueStyle: Exclude<VenueStyle, 'custom'>,
): Promise<VenueOpsData> {
  const data = (await deliveryFetch('/merchant/venue-ops/apply-template', {
    method: 'POST',
    body: JSON.stringify({ venueStyle }),
  })) as { venueOps: VenueOpsData };
  return data.venueOps;
}

export async function fetchPrepStations(): Promise<PrepStation[]> {
  const data = (await deliveryFetch('/merchant/venue-ops/prep-stations')) as {
    prepStations: PrepStation[];
  };
  return data.prepStations;
}

export async function createPrepStation(payload: {
  name: string;
  sortOrder?: number;
  kind?: PrepStation['kind'];
}): Promise<PrepStation> {
  const data = (await deliveryFetch('/merchant/venue-ops/prep-stations', {
    method: 'POST',
    body: JSON.stringify(payload),
  })) as { prepStation: PrepStation };
  return data.prepStation;
}

export async function updatePrepStation(
  id: string,
  payload: { name?: string; sortOrder?: number; kind?: PrepStation['kind'] },
): Promise<PrepStation> {
  const data = (await deliveryFetch(`/merchant/venue-ops/prep-stations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })) as { prepStation: PrepStation };
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

export async function pingStoreTabletDevice(): Promise<
  StoreTabletPairingResponse & { station: JobStation }
> {
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

export async function endShift(merchantId: string, shiftToken?: string | null) {
  return deliveryFetchWithShift(
    merchantId,
    '/merchant/station/shift/end',
    { method: 'POST', body: '{}' },
    shiftToken,
  );
}
