/**
 * Sliced toll plaza / rate-schedule API for Dominion Toll Database + Toll Info.
 * Only methods used by TollInfoPage / TollDatabaseView and their children.
 */
import { API_ENDPOINTS } from '@roam/api-client';
import type { TollPlaza } from '@roam/types/toll';
import { requirePlatformAuthHeaders } from '../auth/platformAuthHeaders';

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

export const tollOpsApi = {
  async getTollPlazas(): Promise<TollPlaza[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.toll}/toll-plazas`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to fetch toll plazas');
    return response.json();
  },

  async getTollPlaza(id: string): Promise<TollPlaza> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.toll}/toll-plazas/${id}`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to fetch toll plaza');
    return response.json();
  },

  async saveTollPlaza(plaza: Partial<TollPlaza>): Promise<{ success: boolean; data: TollPlaza }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.toll}/toll-plazas`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(plaza),
    });
    if (!response.ok) throw new Error('Failed to save toll plaza');
    return response.json();
  },

  async deleteTollPlaza(id: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.toll}/toll-plazas/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to delete toll plaza');
  },

  async getTollInfo() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.toll}/toll-info`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to fetch toll info');
    return response.json();
  },

  async saveTollInfo(schedule: unknown) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.toll}/toll-info`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(schedule),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error((detail as { error?: string } | null)?.error || 'Failed to save toll rates');
    }
    return response.json();
  },

  async previewTollRateImpact(draft: unknown) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.toll}/toll-info/impact-preview`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(draft),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error((detail as { error?: string } | null)?.error || 'Failed to preview rate impact');
    }
    return response.json();
  },

  async getTollPlazaBackfillStatus() {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.toll}/toll-reconciliation/toll-ledger/plaza-backfill/status`,
      { headers: await authHeaders(null) },
    );
    if (!response.ok) throw new Error('Failed to load plaza attribution status');
    return response.json();
  },

  async runTollPlazaBackfill(dryRun: boolean) {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.toll}/toll-reconciliation/toll-ledger/plaza-backfill`,
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ dryRun }),
      },
    );
    if (!response.ok) throw new Error('Failed to attribute tolls to plazas');
    return response.json();
  },

  /** Geocode for AddTollPlazaModal Plus Code / locality lookup. */
  async geocodeAddress(
    address: string,
  ): Promise<{ lat: number; lng: number; formattedAddress?: string; city?: string; parish?: string }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/geo/geocode`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ address }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
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
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { error?: string }).error || 'Reverse geocoding failed');
    }
    return response.json();
  },
};

/** Local alias so moved components can keep `api.*` call sites. */
export const api = tollOpsApi;
