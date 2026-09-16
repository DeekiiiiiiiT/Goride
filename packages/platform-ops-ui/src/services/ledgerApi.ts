/**
 * Sliced ledger API — only methods used by Dominion/Fleet database ledger pages.
 * Uses platform session auth + @roam/api-client endpoints (no apps/fleet imports).
 */
import { API_ENDPOINTS } from '@roam/api-client';
import type { Trip } from '@roam/types';
import type { PaymentLedgerLine } from '@roam/types/paymentLedgerLine';
import { requirePlatformAuthHeaders } from '../auth/platformAuthHeaders';
import type { FuelEntry } from '../types/fuel';
import { currentFuelListWindow } from '../utils/fuelListWindow';

/** V-01: normalize bare array or { data, total } fuel-entries payloads. */
type FuelEntriesListMeta = { totalCount?: number; sortKey?: string; sortDir?: string };

function unwrapFuelEntriesPayload<T = unknown>(
  payload: unknown,
  totalHeader?: string | null,
): T[] & FuelEntriesListMeta {
  const headerTotal =
    totalHeader != null && Number.isFinite(Number(totalHeader))
      ? Number(totalHeader)
      : undefined;

  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    const envelope = payload as {
      data: T[];
      total?: number;
      sortKey?: string;
      sortDir?: string;
    };
    const rows = envelope.data as T[] & FuelEntriesListMeta;
    const total =
      typeof envelope.total === 'number' && Number.isFinite(envelope.total)
        ? envelope.total
        : headerTotal ?? rows.length;
    rows.totalCount = total;
    if (envelope.sortKey != null) rows.sortKey = String(envelope.sortKey);
    if (envelope.sortDir != null) rows.sortDir = String(envelope.sortDir);
    return rows;
  }

  if (Array.isArray(payload)) {
    const rows = payload as T[] & FuelEntriesListMeta;
    if (headerTotal != null) rows.totalCount = headerTotal;
    return rows;
  }

  return [] as T[] & FuelEntriesListMeta;
}

export interface TripFilterParams {
  driverId?: string;
  driverName?: string;
  driverIds?: string[];
  startDate?: string;
  endDate?: string;
  status?: string;
  limit?: number;
  offset?: number;
  cursorDate?: string;
  cursorId?: string;
  platform?: string;
  tripType?: string;
  vehicleId?: string;
  anchorPeriodId?: string;
  minEarnings?: string;
  maxEarnings?: string;
  minDistance?: string;
  hasTip?: string;
  hasSurge?: string;
  organizationId?: string;
  serviceLine?: 'rideshare' | 'rush_delivery' | 'all';
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
}

export interface PaginatedTripResponse {
  data: Trip[];
  page: number;
  limit: number;
  total: number;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 1,
  backoff = 500,
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (response.status >= 500 && retries > 0) {
      throw new Error(`Server error: ${response.status}`);
    }
    return response;
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}

async function authHeaders(contentType: string | null = 'application/json') {
  return requirePlatformAuthHeaders(contentType);
}

export const ledgerApi = {
  async getTripsFiltered(params: TripFilterParams): Promise<PaginatedTripResponse> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleetCore}/trips/search`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      throw new Error(`Failed to search trips: ${response.statusText}`);
    }
    return response.json();
  },

  async exportTripsFiltered(params: TripFilterParams): Promise<Blob> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleetCore}/trips/export`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || `Export failed (${response.status})`);
    }
    return response.blob();
  },

  async getTripStats(params: TripFilterParams): Promise<{
    totalTrips?: number;
    sumAmount?: number;
    sumNet?: number;
    netKnownCount?: number;
    netUnknownCount?: number;
    avgAmount?: number;
    avgDistance?: number;
    completionRate?: number;
    completed?: number;
    distanceCount?: number;
    [key: string]: unknown;
  }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleetCore}/trips/stats`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch trip stats: ${response.statusText}`);
    }
    return response.json();
  },

  async getTollLedger(params?: {
    organizationId?: string;
    startDate?: string;
    endDate?: string;
    driverId?: string;
    vehicleId?: string;
    status?: string;
    search?: string;
    reconciliationStatus?: string;
    type?: string;
    vehiclePlate?: string;
    driverName?: string;
    sortKey?: string;
    sortDir?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }): Promise<{ data: Record<string, unknown>[]; total: number; sortKey?: string; sortDir?: string }> {
    const qs = new URLSearchParams();
    if (params?.organizationId) qs.set('organizationId', params.organizationId);
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    if (params?.driverId) qs.set('driverId', params.driverId);
    if (params?.vehicleId) qs.set('vehicleId', params.vehicleId);
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    if (params?.reconciliationStatus) qs.set('reconciliationStatus', params.reconciliationStatus);
    if (params?.type) qs.set('type', params.type);
    if (params?.vehiclePlate) qs.set('vehiclePlate', params.vehiclePlate);
    if (params?.driverName) qs.set('driverName', params.driverName);
    if (params?.sortKey) qs.set('sortKey', params.sortKey);
    if (params?.sortDir) qs.set('sortDir', params.sortDir);
    qs.set('limit', String(params?.limit ?? 500));
    qs.set('offset', String(params?.offset ?? 0));
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.toll}/toll-reconciliation/ledger?${qs.toString()}`,
      { headers: await authHeaders(null) },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to fetch toll ledger');
    }
    const result = await response.json();
    return {
      data: result.data || [],
      total: result.total ?? 0,
      sortKey: result.sortKey,
      sortDir: result.sortDir,
    };
  },

  async getPaymentLedgerLines(params?: {
    tripId?: string;
    batchId?: string;
    driverId?: string;
    from?: string;
    to?: string;
    platform?: string;
  }): Promise<{ data: PaymentLedgerLine[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.tripId) qs.set('tripId', params.tripId);
    if (params?.batchId) qs.set('batchId', params.batchId);
    if (params?.driverId) qs.set('driverId', params.driverId);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.platform) qs.set('platform', params.platform);
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fleetPay}/payment-ledger-lines?${qs.toString()}`,
      { headers: await authHeaders(null) },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to fetch payment ledger lines');
    }
    return response.json();
  },

  async getFuelEntries(options?: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
    search?: string;
    paymentSource?: string;
    entryMode?: string;
    type?: string;
    auditStatus?: string;
    driverId?: string;
    vehicleId?: string;
    organizationId?: string;
    sortKey?: string;
    sortDir?: 'asc' | 'desc';
  }): Promise<FuelEntry[]> {
    const fallback = currentFuelListWindow();
    const startDate = options?.startDate || fallback.startDate;
    const endDate = options?.endDate || fallback.endDate;
    const query = new URLSearchParams();
    query.append('limit', String(options?.limit || 500));
    query.append('offset', String(options?.offset ?? 0));
    query.append('startDate', startDate);
    query.append('endDate', endDate);
    if (options?.search) query.append('search', options.search);
    if (options?.paymentSource) query.append('paymentSource', options.paymentSource);
    if (options?.entryMode) query.append('entryMode', options.entryMode);
    if (options?.type) query.append('type', options.type);
    if (options?.auditStatus) query.append('auditStatus', options.auditStatus);
    if (options?.driverId) query.append('driverId', options.driverId);
    if (options?.vehicleId) query.append('vehicleId', options.vehicleId);
    if (options?.organizationId) query.append('organizationId', options.organizationId);
    if (options?.sortKey) query.append('sortKey', options.sortKey);
    if (options?.sortDir) query.append('sortDir', options.sortDir);
    query.append('shape', 'envelope');

    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries?${query.toString()}`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to fetch fuel entries');
    const totalHeader = response.headers.get('X-Total-Count');
    const payload = await response.json();
    return unwrapFuelEntriesPayload<FuelEntry>(payload, totalHeader);
  },
};

/** Alias for pages that previously used `api` / `fuelService`. */
export const api = ledgerApi;
export const fuelService = {
  getFuelEntries: ledgerApi.getFuelEntries.bind(ledgerApi),
};
