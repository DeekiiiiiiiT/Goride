/**
 * Sliced station / learnt-location / evidence-inbox API for Dominion Station Database.
 * Only methods used by StationDatabaseView, ResolutionQueueTab, GasStationAnalytics, and children.
 */
import { API_ENDPOINTS } from '@roam/api-client';
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

export const stationOpsApi = {
  async getStationGateEvidence(options?: { limit?: number }) {
    const params = new URLSearchParams();
    if (options?.limit != null) params.set('limit', String(options.limit));
    const qs = params.toString();
    const url = `${API_ENDPOINTS.financial}/admin/station-gate-evidence${qs ? `?${qs}` : ''}`;
    const response = await fetchWithRetry(url, { headers: await authHeaders(null) });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to fetch station gate evidence');
    }
    return response.json();
  },

  async addStationAlias(id: string, alias: { lat: number; lng: number; label: string }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/${id}/alias`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify(alias),
    });
    if (!response.ok) throw new Error('Failed to add alias');
    return response.json();
  },

  async syncMasterPin(
    id: string,
    payload: { lat: number; lng: number; transactionId: string },
  ) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/${id}/sync-master-pin`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to sync master pin');
    return response.json();
  },

  async promoteLearntLocationToMaster(payload: {
    learntId: string;
    action: 'merge' | 'create';
    targetStationId?: string;
    stationData?: unknown;
  }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/promote-learnt`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: string }).error || `Promotion failed with status ${response.status}`,
      );
    }
    return response.json();
  },

  async ensureLearntForGateHeldTransaction(transactionId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/evidence-inbox/ensure-learnt`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ transactionId }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to ensure learnt staging');
    }
    return response.json() as Promise<{ success: boolean; learntId: string }>;
  },

  async deleteGateHeldEvidence(transactionId: string) {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/admin/evidence-inbox/gate-held/${encodeURIComponent(transactionId)}`,
      { method: 'DELETE', headers: await authHeaders(null) },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to delete gate-held transaction');
    }
    return response.json() as Promise<{
      success: boolean;
      transactionDeleted: boolean;
      learntDeleted: boolean;
    }>;
  },

  async mergeGateHeldTransactionToStation(transactionId: string, targetStationId: string) {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/admin/evidence-inbox/merge-to-station`,
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ transactionId, targetStationId }),
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to merge transaction to station');
    }
    return response.json();
  },

  async getStations() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to fetch stations');
    return response.json();
  },

  async reconcileLedgerOrphans() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/reconcile-ledger-orphans`, {
      method: 'POST',
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to reconcile orphans');
    return response.json();
  },

  async getSpatialReviewQueue(): Promise<{ items: any[]; count: number }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/spatial-review-queue`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to fetch spatial review queue');
    return response.json();
  },

  async deleteSpatialReviewRecord(payload: {
    recordType: 'fuel_entry' | 'transaction';
    id: string;
  }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/spatial-review/delete`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to delete record');
    }
    return response.json();
  },

  async bulkAssignStation(entryIds: string[], stationId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/bulk-assign-station`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ entryIds, stationId }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as { error?: string }).error || 'Failed to bulk assign station');
    }
    return response.json();
  },

  async deleteStation(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to delete station');
    return response.json();
  },

  async getStationProofOfWork(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/${id}/proof-of-work`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to fetch proof of work');
    return response.json();
  },

  async getLearntLocations() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/learnt-locations`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to fetch learnt locations');
    return response.json();
  },

  async rescanLearntLocations(radius = 75) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/learnt-locations/rescan`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ radius }),
    });
    if (!response.ok) throw new Error('Bulk re-scan failed');
    return response.json();
  },

  async rejectLearntLocation(id: string, reason: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/learnt-locations/${id}/reject`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) throw new Error('Failed to reject location');
    return response.json();
  },

  async deleteLearntLocation(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/learnt-locations/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to delete learnt location');
    return response.json();
  },

  async mergeLearntLocation(id: string, targetStationId: string, updateMasterPin = false) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/learnt-locations/merge`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ id, targetStationId, updateMasterPin }),
    });
    if (!response.ok) throw new Error('Failed to merge location');
    return response.json();
  },

  async searchStations(query: string): Promise<{ stations: unknown[] }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fleetCore}/stations/search?q=${encodeURIComponent(query)}`,
      { headers: await authHeaders(null) },
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to search stations: ${errText}`);
    }
    return response.json();
  },

  async scanLegacyTransactions() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleetCore}/migrate-legacy-vendors`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ dryRun: true }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Scan failed: ${errText}`);
    }
    return response.json();
  },

  async processMigrationTransaction(
    transactionId: string,
    action: 'create_vendor' | 'match_station' | 'skip' | 'reject',
    data?: {
      stationId?: string;
      vendorName?: string;
      resolvedBy?: string;
      reason?: string;
    },
  ) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleetCore}/process-migration-transaction`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ transactionId, action, data }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to process transaction: ${errText}`);
    }
    return response.json();
  },

  /** Vehicles for fuel-type breakdown in StationDetailView. */
  async getVehiclesPage(opts?: { limit?: number; offset?: number }) {
    const limit = opts?.limit ?? 500;
    const offset = opts?.offset ?? 0;
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleetCore}/vehicles?${qs}`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error('Failed to fetch vehicles');
    return response.json();
  },

  async getVehicles() {
    const pageSize = 500;
    const maxPages = 40;
    const vehicles: any[] = [];
    for (let i = 0; i < maxPages; i++) {
      const page = await this.getVehiclesPage({ limit: pageSize, offset: i * pageSize });
      const rows = Array.isArray(page) ? page : [];
      vehicles.push(...rows);
      if (rows.length < pageSize) return vehicles;
    }
    return vehicles;
  },
};

/** Alias matching fleet screens that import `{ api }`. */
export const api = stationOpsApi;
