/**
 * Sliced fuel/station catalogue service for Station Database + Gas Station Analytics.
 * Only methods stations screens call (not the full fleet fuelService).
 */
import { API_ENDPOINTS } from '@roam/api-client';
import { requirePlatformAuthHeaders } from '../auth/platformAuthHeaders';
import type { FuelEntry } from '../types/fuel';
import { ledgerApi } from './ledgerApi';

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

export const stationFuelService = {
  getFuelEntries: ledgerApi.getFuelEntries.bind(ledgerApi) as (
    options?: Parameters<typeof ledgerApi.getFuelEntries>[0],
  ) => Promise<FuelEntry[]>,

  async getStations(opts?: {
    limit?: number;
    offset?: number;
    fields?: 'list' | 'full';
  }): Promise<any[]> {
    const limit = opts?.limit ?? 500;
    const offset = opts?.offset ?? 0;
    const fields = opts?.fields ?? 'list';
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      fields,
    });
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations?${params}`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to fetch stations');
    const data = await response.json();
    const totalHeader = response.headers.get('X-Total-Count');
    if (Array.isArray(data) && totalHeader != null) {
      (data as any).totalCount = parseInt(totalHeader, 10) || data.length;
    }
    return data;
  },

  async getAllStations(opts?: {
    fields?: 'list' | 'full';
    pageSize?: number;
  }): Promise<any[]> {
    const pageSize = opts?.pageSize ?? 500;
    const fields = opts?.fields ?? 'list';
    const all: any[] = [];
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
      const page = await this.getStations({ limit: pageSize, offset, fields });
      const pageTotal =
        typeof (page as any).totalCount === 'number' ? (page as any).totalCount : page.length;
      total = pageTotal;
      all.push(...page);
      if (page.length === 0 || page.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  },

  async checkStationDuplicate(
    plusCode: string,
    lat: number,
    lng: number,
    excludeId?: string,
    category?: string,
  ) {
    const params = new URLSearchParams();
    if (plusCode) params.append('plusCode', plusCode);
    if (lat) params.append('lat', String(lat));
    if (lng) params.append('lng', String(lng));
    if (excludeId) params.append('excludeId', excludeId);
    if (category) params.append('category', category);
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/stations/check-duplicate?${params.toString()}`,
      { headers: await authHeaders(null) },
    );
    if (!response.ok) throw new Error('Failed to check for station duplicates');
    return response.json();
  },

  async saveStation(station: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(station),
    });
    if (response.status === 409) {
      const dupeData = await response.json();
      const error = new Error(
        (dupeData as { message?: string }).message || 'Duplicate station detected',
      ) as Error & { duplicate?: boolean; existingStation?: any };
      error.duplicate = true;
      error.existingStation = (dupeData as { existingStation?: any }).existingStation;
      throw error;
    }
    if (!response.ok) throw new Error('Failed to save station');
    const result = await response.json();
    if ((result as { autoCleanedLearnt?: unknown }).autoCleanedLearnt !== undefined) {
      return result;
    }
    return (result as { data?: unknown }).data || result;
  },

  async deleteStation(id: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to delete station');
  },

  async demoteStation(stationId: string): Promise<{
    success: boolean;
    stationName: string;
    unlinkedEntries: number;
    learntLocationId: string | null;
    message: string;
  }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/demote`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ stationId }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to demote station');
    }
    return response.json();
  },

  async migrateStationStatuses(): Promise<{ patchedCount: number; totalStations: number }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/migrate-status`, {
      method: 'POST',
      headers: await authHeaders(),
    });
    if (!response.ok) throw new Error('Failed to run station status migration');
    return response.json();
  },

  async getMigrationFlag(key: string): Promise<{ done: boolean }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/migrations/${encodeURIComponent(key)}`,
      { headers: await authHeaders(null) },
    );
    if (!response.ok) return { done: false };
    return response.json();
  },

  async setMigrationFlag(key: string): Promise<void> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/migrations/${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ done: true }),
      },
    );
    if (!response.ok) throw new Error('Failed to set migration flag');
  },

  async getParentCompanies(): Promise<any[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/parent-companies`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to fetch parent companies');
    return response.json();
  },

  async saveParentCompanies(companies: any[]): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/parent-companies`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(companies),
    });
    if (!response.ok) throw new Error('Failed to save parent companies');
  },

  async geocodeAddress(
    address: string,
  ): Promise<{ lat: number; lng: number; formattedAddress?: string; city?: string; parish?: string }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/geo/geocode`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ address }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error((error as { error?: string }).error || 'Geocoding failed');
    }
    return response.json();
  },

  async reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<{
    formattedAddress: string;
    streetAddress: string;
    city: string;
    parish: string;
    country: string;
    lat: number;
    lng: number;
  }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/geo/reverse-geocode`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ lat, lng }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error((error as { error?: string }).error || 'Reverse geocoding failed');
    }
    return response.json();
  },
};

/** Alias matching fleet screens that import `{ fuelService }`. */
export const fuelService = stationFuelService;
