import { API_ENDPOINTS } from './apiConfig';
import { fetchWithRetry } from './api';
import { getInventoryAuthHeaders } from '../utils/authHeaders';

const BASE = `${API_ENDPOINTS.fleetCore}/inventory`;

async function invFetch(path: string, init: RequestInit = {}) {
  const headers = await getInventoryAuthHeaders(init.method === 'POST' ? 'application/json' : null);
  const response = await fetchWithRetry(`${BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Inventory API ${response.status}`);
  }
  return response.json();
}

export type DriverCarKitItem = {
  id?: string;
  name: string;
  locationHint?: string;
  status?: 'present' | 'missing' | 'linked' | 'reported';
};

export type DriverCarKitPayload = {
  stub?: boolean;
  organizationId?: string;
  vehicleId?: string | null;
  vehicleLabel?: string | null;
  vehicleMakeModel?: string | null;
  odometerKm?: number | null;
  fuelLevelPct?: number | null;
  items?: DriverCarKitItem[];
  openReportCount?: number;
  lastCheckInAt?: string | null;
  state?: 'ready' | 'no_vehicle' | 'no_kit';
};

export type DriverReportRow = {
  id?: string;
  reportNo?: string;
  issue?: string;
  note?: string;
  status?: string;
  fleetReply?: string | null;
  seenAt?: string | null;
  fixedAt?: string | null;
  createdAt?: string;
  photoPaths?: string[];
  itemLabel?: string;
  displayName?: string;
};

export type DriverReportsListResponse = {
  items: DriverReportRow[];
  nextCursor?: string | null;
  organizationId?: string;
};

export type DriverReportPayload = {
  itemIds?: string[];
  itemNames?: string[];
  issueType?: string;
  notes?: string;
  photoUrls?: string[];
};

export type DriverKitCheckPayload = {
  vehicleId?: string | null;
  allPresent: boolean;
  missingItemIds?: string[];
  weeklyCheckInId?: string | null;
};

export const driverInventoryApi = {
  carKit: (vehicleId?: string | null) => {
    const q = vehicleId ? `?vehicle_id=${encodeURIComponent(vehicleId)}` : '';
    return invFetch(`/driver/car-kit${q}`) as Promise<DriverCarKitPayload>;
  },

  reports: (params?: { limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    const q = search.toString();
    return invFetch(`/driver/reports${q ? `?${q}` : ''}`) as Promise<DriverReportsListResponse>;
  },

  submitReport: (body: DriverReportPayload, idempotencyKey: string) =>
    invFetch('/driver/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    }),

  kitCheck: (body: DriverKitCheckPayload, idempotencyKey: string) =>
    invFetch('/driver/kit-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    }),
};
