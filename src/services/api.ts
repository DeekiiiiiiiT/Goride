import { projectId, publicAnonKey } from '../utils/supabase/info';
import { supabase } from '../utils/supabase/client';
import { Trip, Notification, ImportBatch, CanonicalBatchAuditSnapshot, DriverMetrics, VehicleMetrics, FinancialTransaction, LedgerEntry, LedgerFilterParams, PaginatedLedgerResponse, LedgerDriverOverview, IndriveWalletSummary, DisputeRefund } from '../types/data';
import type { AppendCanonicalLedgerResult, CanonicalLedgerEventInput } from '../types/ledgerCanonical';
import { OdometerReading } from '../types/vehicle';
import { TollPlaza } from '../types/toll';
import { API_ENDPOINTS } from './apiConfig';
import { compressImage } from '../utils/compressImage';
import { isTollCategory } from '../utils/tollCategoryHelper';

// Helper to get authorization headers (JWT if logged in, else anon key)
async function getHeaders(contentType: string | null = 'application/json') {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || publicAnonKey;
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`
  };
  
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  
  return headers;
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
    platform?: string;
    tripType?: string;
    vehicleId?: string;
    anchorPeriodId?: string; // Phase 6: Direct lookup
    minEarnings?: string;
    maxEarnings?: string;
    minDistance?: string;
    hasTip?: string;
    hasSurge?: string;
    organizationId?: string; // Super Admin: scope to specific customer org
}

export interface PaginatedTripResponse {
    data: Trip[];
    page: number;
    limit: number;
    total: number;
}

// Performance optimization: Reduced to 1 retry (2 total attempts)
// Server already retries 2x, so total attempts = 2 server × 2 frontend = 4
export async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 1, backoff = 500): Promise<Response> {
  try {
    const response = await fetch(url, options);
    // If 5xx error, retry
    if (response.status >= 500 && retries > 0) {
        throw new Error(`Server error: ${response.status}`);
    }
    return response;
  } catch (err) {
    if (retries > 0) {
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}

/** Parse JSON `{ error: string }` from failed financial GET responses when possible (matches server `return c.json({ error })`). */
async function parseFinancialApiErrorBody(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const j = JSON.parse(raw);
    if (j && typeof j.error === 'string') return j.error;
  } catch {
    /* keep raw */
  }
  return raw || '(empty body)';
}

export const api = {
  async getOdometerHistory(vehicleId: string): Promise<OdometerReading[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/odometer-history/${vehicleId}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch odometer history");
    return response.json();
  },

  async addOdometerReading(reading: Partial<OdometerReading>) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/odometer-history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(reading)
    });
    if (!response.ok) throw new Error("Failed to save odometer reading");
    return response.json();
  },

  async deleteOdometerReading(id: string, vehicleId: string, source?: string) {
    const params = new URLSearchParams({ vehicleId });
    if (source) params.set('source', source);
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/odometer-history/${id}?${params.toString()}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete odometer reading");
    return response.json();
  },

  async updateAnchor(id: string, payload: { date?: string, value?: number, type: string, vehicleId: string }) {
    // Uses the generic PATCH endpoint added to server/index.tsx
    // Endpoint path: /make-server-37f42386/anchors/:id
    // Note: API_ENDPOINTS.fuel typically points to /make-server-37f42386/... 
    // We'll assume the path is relative to the base function URL if possible, or construct it.
    // Based on other calls, API_ENDPOINTS.fuel seems to be the base URL.
    // However, I added the route at root level /make-server.../anchors
    // Let's use absolute path construction similar to others if needed, or stick to convention.
    // Actually, looking at deleteOdometerReading: `${API_ENDPOINTS.fuel}/odometer-history/...`
    // I'll assume I can use `${API_ENDPOINTS.fuel}/anchors/${id}` if I ensure the route is correct.
    // In server/index.tsx, I defined `app.patch("/make-server-37f42386/anchors/:id", ...)`
    // If API_ENDPOINTS.fuel is `.../make-server-37f42386`, then `${API_ENDPOINTS.fuel}/anchors/${id}` works.
    
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/anchors/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Failed to update anchor");
    return response.json();
  },

  async getBatches(): Promise<ImportBatch[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/batches`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch batches");
    return response.json();
  },

  async createBatch(batch: ImportBatch) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/batches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(batch)
    });
    if (!response.ok) throw new Error("Failed to create batch");
    return response.json();
  },

  /** Phase 7: merge audit fields into `batch:{id}` (org-scoped). */
  async patchImportBatch(
    id: string,
    patch: Partial<
      Pick<
        ImportBatch,
        | 'canonicalEventsInserted'
        | 'canonicalEventsSkipped'
        | 'canonicalEventsFailed'
        | 'canonicalAppendCompletedAt'
        | 'periodStart'
        | 'periodEnd'
        | 'uploadedBy'
        | 'processedBy'
        | 'contentFingerprint'
      >
    >,
  ): Promise<{ success: boolean; data: ImportBatch }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/batches/${id}`, {
      method: 'PATCH',
      headers: await getHeaders(),
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Failed to update batch (${response.status})`);
    }
    return response.json();
  },

  /** Phase 7: scan canonical ledger rows for `batchId` (org-scoped recount). */
  async getCanonicalBatchAudit(batchId: string): Promise<CanonicalBatchAuditSnapshot> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/canonical-batch-audit/${encodeURIComponent(batchId)}`,
      { headers: await getHeaders(null) },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Canonical batch audit failed (${response.status})`);
    }
    const body = await response.json();
    if (!body?.success || !body?.data) {
      throw new Error('Invalid canonical batch audit response');
    }
    return body.data as CanonicalBatchAuditSnapshot;
  },

  async getBatchDeletePreview(id: string): Promise<{
    batch: ImportBatch;
    trips: number;
    transactions: number;
    ledgerEntries: number;
    /** Support Adjustment dispute refunds (`dispute-refund:*`) tagged with this `batchId` */
    disputeRefunds?: number;
    driverMetrics: { affected: number; safeToDelete: number; shared: number; details: any[] };
    vehicleMetrics: { affected: number; safeToDelete: number; shared: number; details: any[] };
  }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/batches/${id}/delete-preview`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Batch delete preview failed (${response.status})`);
    }
    return response.json();
  },

  async deleteBatch(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/batches/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete batch");
    return response.json();
  },

  async saveTrips(trips: Trip[]) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(trips),
    });
    
    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
          const errorBody = await response.json();
          if (errorBody.error) {
              errorMessage = errorBody.error;
          }
      } catch (e) {
          // Ignore json parse error, use statusText
      }
      throw new Error(`Failed to save trips: ${errorMessage}`);
    }
    return response.json();
  },

  async deleteTrip(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/trips/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete trip");
    return response.json();
  },

  async saveDriverMetrics(metrics: DriverMetrics[]) {
      const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/driver-metrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(metrics),
      });
      if (!response.ok) throw new Error(`Failed to save driver metrics`);
      return response.json();
  },

  async saveVehicleMetrics(metrics: VehicleMetrics[]) {
      const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/vehicle-metrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(metrics),
      });
      if (!response.ok) throw new Error(`Failed to save vehicle metrics`);
      return response.json();
  },

  async getVehicleMetrics(): Promise<VehicleMetrics[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/vehicle-metrics`, {
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        }
    });
    if (!response.ok) throw new Error("Failed to fetch vehicle metrics");
    const txt = await response.text();
    try { return JSON.parse(txt); } catch (e) { console.error(`getVehicleMetrics JSON parse error, len=${txt.length}, snippet=${txt.slice(0, 200)}`); throw new Error(`Vehicle metrics response is not valid JSON (len=${txt.length})`); }
  },

  async getDriverMetrics(): Promise<DriverMetrics[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/driver-metrics`, {
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        }
    });
    if (!response.ok) throw new Error("Failed to fetch driver metrics");
    const txt = await response.text();
    try { return JSON.parse(txt); } catch (e) { console.error(`getDriverMetrics JSON parse error, len=${txt.length}, snippet=${txt.slice(0, 200)}`); throw new Error(`Driver metrics response is not valid JSON (len=${txt.length})`); }
  },

  async getTripsFiltered(params: TripFilterParams): Promise<PaginatedTripResponse> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/trips/search`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(params)
    });
    
    if (!response.ok) {
        throw new Error(`Failed to search trips: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getTripStats(params: TripFilterParams): Promise<any> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/trips/stats`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(params)
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch trip stats: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getTrips(options?: { limit?: number, offset?: number }): Promise<Trip[]> {
    // Default to a reasonable limit to prevent connection resets on large datasets
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;
    
    let url = `${API_ENDPOINTS.fleet}/trips?limit=${limit}&offset=${offset}`;

    const response = await fetchWithRetry(url, {
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch trips: ${response.statusText}`);
    }
    
    // Use text + JSON.parse for safer parsing with better error diagnostics
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      console.error(`getTrips JSON parse error at limit=${limit}, response length=${text.length}, snippet=${text.slice(0, 200)}`);
      throw new Error(`Trips response is not valid JSON (length=${text.length}). Possibly truncated.`);
    }
  },

  async getUnifiedVehicleLogs(vehicleId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/vehicles/${vehicleId}/unified-logs`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch unified logs");
    return response.json();
  },

  async clearAllData() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/trips`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to clear data: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getNotifications(): Promise<Notification[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/notifications`, {
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch notifications: ${response.status} ${errorText}`);
    }

    return response.json();
  },

  // Persistent Alerts (Phase 1)
  async getPersistentAlerts(userId?: string, vehicleId?: string): Promise<Notification[]> {
    const url = new URL(`${API_ENDPOINTS.admin}/notifications/list`);
    if (userId) url.searchParams.append('userId', userId);
    if (vehicleId) url.searchParams.append('vehicleId', vehicleId);
    
    // Single attempt (no retries) — this is a background poll that retries every 30s anyway
    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      throw new Error(`Persistent alerts fetch failed: ${response.status} ${errorText}`);
    }
    return response.json();
  },

  async pushAlert(alert: Partial<Notification>) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/notifications/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(alert)
    });
    if (!response.ok) throw new Error("Failed to push alert");
    return response.json();
  },

  // Audit Endpoints (Phase 4)
  async logAuditAction(payload: { 
    entityId: string, 
    entityType: string, 
    action: string, 
    oldValue?: any, 
    newValue?: any, 
    reason: string, 
    userId: string 
  }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/audit/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Failed to create audit log");
    return response.json();
  },

  async getAuditLogs(entityId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/audit/logs/${entityId}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch audit logs");
    return response.json();
  },

  async verifyIntegrity(record: any, signature: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/audit/verify-integrity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ record, signature })
    });
    if (!response.ok) throw new Error("Failed to verify integrity");
    return response.json();
  },

  async acknowledgeAlert(id: string, isDismissed: boolean = false) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/notifications/acknowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ id, isDismissed })
    });
    if (!response.ok) throw new Error("Failed to acknowledge alert");
    return response.json();
  },

  async markNotificationAsRead(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to mark notification as read`);
    }

    return response.json();
  },

  async createNotification(notification: Partial<Notification>) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(notification)
    });

    if (!response.ok) {
      throw new Error(`Failed to create notification`);
    }

    return response.json();
  },

  async getAlertRules() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/alert-rules`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch alert rules");
    return response.json();
  },

  async saveAlertRule(rule: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/alert-rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(rule)
    });
    if (!response.ok) throw new Error("Failed to save alert rule");
    return response.json();
  },

  async deleteAlertRule(id: string) {
     const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/alert-rules/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete alert rule");
    return response.json();
  },

  async getIntegrations() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/settings/integrations`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch integrations");
    return response.json();
  },

  async saveIntegration(integration: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/settings/integrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(integration)
    });
    if (!response.ok) throw new Error("Failed to save integration");
    return response.json();
  },

  async getBudgets() {
      const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/budgets`, {
          headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      if (!response.ok) throw new Error("Failed to fetch budgets");
      return response.json();
  },

  async saveBudget(budget: any) {
      const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/budgets`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify(budget)
      });
      if (!response.ok) throw new Error("Failed to save budget");
      return response.json();
  },

  async getVehicleTankStatus(vehicleId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/vehicles/${vehicleId}/tank-status`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch tank status");
    return response.json();
  },

  // Fuel Audit Endpoints (Phase 4 & 5 & 6)
  async getFuelAuditSummary(vehicleId?: string) {
    const url = vehicleId 
      ? `${API_ENDPOINTS.fuel}/fuel-audit/summary?vehicleId=${vehicleId}`
      : `${API_ENDPOINTS.fuel}/fuel-audit/fleet-stats`;
    const response = await fetchWithRetry(url, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch audit summary");
    return response.json();
  },

  async getFlaggedTransactions() {
    // Flagged transactions are just fuel entries with isFlagged: true
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch flagged transactions");
    const all = await response.json();
    return all.filter((e: any) => e.isFlagged);
  },

  async resolveFuelAnomaly(transactionId: string, status: 'resolved' | 'disputed' | 'rejected', note: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/admin/fuel-audit/resolve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, status, note })
    });
    if (!response.ok) throw new Error("Failed to resolve anomaly");
    return response.json();
  },

  async getVehicles() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/vehicles`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch vehicles");
    return response.json();
  },

  async saveVehicle(vehicle: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/vehicles`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(vehicle)
    });
    if (!response.ok) throw new Error("Failed to save vehicle");
    return response.json();
  },

  async deleteVehicle(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/vehicles/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete vehicle");
    return response.json();
  },

    async saveFuelEntry(entry: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(entry)
    });
    if (!response.ok) throw new Error("Failed to save fuel entry");
    return response.json();
  },

  async getDrivers() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/drivers`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch drivers");
    const txt = await response.text();
    try { return JSON.parse(txt); } catch (e) { console.error(`getDrivers JSON parse error, len=${txt.length}, snippet=${txt.slice(0, 200)}`); throw new Error(`Drivers response is not valid JSON (len=${txt.length})`); }
  },

  async saveDriver(driver: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/drivers`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(driver)
    });
    if (!response.ok) throw new Error("Failed to save driver");
    return response.json();
  },

  async fetchPendingTollClaims(): Promise<FinancialTransaction[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/transactions`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch transactions");
    const allTx: FinancialTransaction[] = await response.json();
    
    // Filter for Cash Tolls that are Pending
    return allTx.filter(tx => 
        isTollCategory(tx.category) && 
        tx.status === 'Pending' && 
        (tx.paymentMethod === 'Cash' || !!tx.receiptUrl)
    );
  },

  async getTransactions(driverIdOrIds?: string | string[], options?: { limit?: number; offset?: number }) {
    let url = `${API_ENDPOINTS.financial}/transactions`;
    const params = new URLSearchParams();
    if (driverIdOrIds) {
        const ids = Array.isArray(driverIdOrIds) ? driverIdOrIds.filter(Boolean).join(',') : driverIdOrIds;
        if (ids) {
            params.set('driverIds', ids);
        }
    }
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.offset !== undefined) params.set('offset', String(options.offset));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
    const response = await fetchWithRetry(url, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch transactions");
    return response.json();
  },

  async saveTransaction(transaction: Partial<FinancialTransaction>) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/transactions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(transaction)
    });
    if (!response.ok) {
      const msg = await parseFinancialApiErrorBody(response);
      throw new Error(msg || 'Failed to save transaction');
    }
    const result = await response.json();
    return result.data || result;
  },

  async deleteTransaction(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/transactions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete transaction");
    return response.json();
  },

  async uploadFile(file: File) {
    // Compress images client-side before upload to stay within Supabase Storage 5MB limit
    const processedFile = await compressImage(file);

    const formData = new FormData();
    formData.append('file', processedFile);
    
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: formData
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to upload file");
    }
    return response.json();
  },

  async scanReceipt(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/scan-receipt`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: formData
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to scan receipt");
    }
    return response.json();
  },

  async parseDocument(file: File, type: 'license' | 'address' | 'vehicle_registration', backFile?: File) {
    const formData = new FormData();
    formData.append('file', file);
    if (backFile) {
      formData.append('backFile', backFile);
    }
    formData.append('type', type);
    
    const response = await fetchWithRetry(`${API_ENDPOINTS.ai}/parse-document`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: formData
    });
    // Handle 503 specifically? Or just let it throw?
    // If it throws, frontend catches and allows manual entry.
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to parse document");
    }
    return response.json();
  },

  async generateVehicleImage(vehicleData: { make: string, model: string, year: string, color: string, bodyType: string, licensePlate?: string }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/generate-vehicle-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(vehicleData)
    });
    
    if (!response.ok) {
        throw new Error("Failed to generate vehicle image");
    }
    
    return response.json();
  },

  async getPreferences() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/settings/preferences`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch preferences");
    return response.json();
  },

  async savePreferences(preferences: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/settings/preferences`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(preferences)
    });
    if (!response.ok) throw new Error("Failed to save preferences");
    return response.json();
  },

  // ── Toll Info ──────────────────────────────────────────────────────────
  async getTollInfo() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/toll-info`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch toll info");
    return response.json();
  },

  async saveTollInfo(schedule: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/toll-info`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(schedule)
    });
    if (!response.ok) throw new Error("Failed to save toll info");
    return response.json();
  },

  async saveFleetState(state: { 
      drivers: DriverMetrics[], 
      vehicles: VehicleMetrics[], 
      trips: Trip[], 
      financials: any,
      metadata?: any,
      insights?: any 
  }) {
      const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/fleet/sync`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify(state)
      });
      
      if (!response.ok) {
          throw new Error(`Failed to save fleet state: ${response.statusText}`);
      }
      
      return response.json();
  },

  async getDashboardStats() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/dashboard/stats`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch dashboard stats");
    return response.json();
  },

  /** Fix 2: Aggregated init — stats + trips + driverMetrics + vehicleMetrics in one call */
  async getDashboardInit(): Promise<{ stats: any; trips: any[]; driverMetrics: any[]; vehicleMetrics: any[] }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/dashboard/init`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch dashboard init bundle");
    return response.json();
  },

  // Station Management (Phase 3)
  async addStationAlias(id: string, alias: { lat: number, lng: number, label: string }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/${id}/alias`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(alias)
    });
    if (!response.ok) throw new Error("Failed to add alias");
    return response.json();
  },

  async syncMasterPin(id: string, payload: { lat: number, lng: number, transactionId: string }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/${id}/sync-master-pin`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Failed to sync master pin");
    return response.json();
  },

  async getIntegrityMetrics() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/analytics/integrity-metrics`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch integrity metrics");
    return response.json();
  },

  async promoteLearntLocationToMaster(payload: { learntId: string, action: 'merge' | 'create', targetStationId?: string, stationData?: any }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/promote-learnt`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
      // Phase 7-8 fix: Show actual error message from server
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Promotion failed with status ${response.status}`);
    }
    return response.json();
  },

  async getStations() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch stations");
    return response.json();
  },

  async checkStationDuplicate(plusCode: string, lat: number, lng: number, excludeId?: string, category?: string) {
    const params = new URLSearchParams();
    if (plusCode) params.append('plusCode', plusCode);
    if (lat) params.append('lat', String(lat));
    if (lng) params.append('lng', String(lng));
    if (excludeId) params.append('excludeId', excludeId);
    if (category) params.append('category', category);
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/check-duplicate?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to check for station duplicates");
    return response.json();
  },

  async reconcileLedgerOrphans() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/reconcile-ledger-orphans`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to reconcile orphans");
    return response.json();
  },

  async getSpatialReviewQueue(): Promise<{ items: any[]; count: number }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/spatial-review-queue`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` },
    });
    if (!response.ok) throw new Error('Failed to fetch spatial review queue');
    return response.json();
  },

  async deleteSpatialReviewRecord(payload: { recordType: 'fuel_entry' | 'transaction'; id: string }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/spatial-review/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as any).error || 'Failed to delete record');
    }
    return response.json();
  },

  async bulkAssignStation(entryIds: string[], stationId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/bulk-assign-station`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ entryIds, stationId })
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[BulkAssign API Error]", errorData);
        throw new Error(errorData.error || "Failed to bulk assign station");
    }
    return response.json();
  },

  async saveStation(station: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(station)
    });
    // Handle 409 Conflict (duplicate station detected) — surface the structured response
    if (response.status === 409) {
      const dupeData = await response.json();
      const error: any = new Error(dupeData.message || 'Duplicate station detected');
      error.duplicate = true;
      error.existingStation = dupeData.existingStation;
      throw error;
    }
    if (!response.ok) throw new Error("Failed to save station");
    return response.json();
  },

  async deleteStation(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete station");
    return response.json();
  },

  async getStationProofOfWork(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/${id}/proof-of-work`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch proof of work");
    return response.json();
  },

  async getLearntLocations() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/learnt-locations`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch learnt locations");
    return response.json();
  },

  async rescanLearntLocations(radius: number = 75) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/learnt-locations/rescan`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ radius })
    });
    if (!response.ok) throw new Error("Bulk re-scan failed");
    return response.json();
  },

  async promoteLearntLocation(id: string, stationDetails: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/learnt-locations/promote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ id, stationDetails })
    });
    if (!response.ok) throw new Error("Failed to promote location");
    return response.json();
  },

  async rejectLearntLocation(id: string, reason: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/learnt-locations/${id}/reject`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ reason })
    });
    if (!response.ok) throw new Error("Failed to reject location");
    return response.json();
  },

  async deleteLearntLocation(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/learnt-locations/${id}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        }
    });
    if (!response.ok) throw new Error("Failed to delete learnt location");
    return response.json();
  },

  async mergeLearntLocation(id: string, targetStationId: string, updateMasterPin: boolean = false) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/learnt-locations/merge`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ id, targetStationId, updateMasterPin })
    });
    if (!response.ok) throw new Error("Failed to merge location");
    return response.json();
  },

  async runFuelBackfill() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/backfill-fuel-integrity`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Backfill job failed");
    return response.json();
  },

  async runPaymentSourceBackfill() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/backfill-payment-sources`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Payment source backfill failed");
    return response.json();
  },

  async runEvidenceBridgeStressTest(vehicleId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/stress-test-evidence-bridge`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId })
    });
    if (!response.ok) throw new Error("Stress test failed");
    return response.json();
  },

  async verifyRecordForensics(recordId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/verify-record-forensics`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId })
    });
    if (!response.ok) throw new Error("Forensic verification failed");
    return response.json();
  },

  // --- Synchronization Helpers (Phase 1) ---
  async getLinkedFuelEntry(idOrTransactionId: string): Promise<any | null> {
    if (!idOrTransactionId) return null;
    try {
      const entriesResponse = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      if (!entriesResponse.ok) return null;
      const entries = await entriesResponse.json();
      return entries.find((e: any) => e.id === idOrTransactionId || e.transactionId === idOrTransactionId) || null;
    } catch (e) {
      console.error("Error fetching linked fuel entry:", e);
      return null;
    }
  },

  async getFinancials() {
      const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/financials`, {
          headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      if (!response.ok) throw new Error("Failed to fetch financials");
      return response.json();
  },

  async saveFinancials(financials: any) {
      const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/financials`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify(financials)
      });
      if (!response.ok) throw new Error("Failed to save financials");
      return response.json();
  },

  async getMaintenanceLogs(vehicleId: string) {
      const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/maintenance-logs/${vehicleId}`, {
          headers: await getHeaders(null),
      });
      if (!response.ok) throw new Error("Failed to fetch maintenance logs");
      return response.json();
  },

  async getAllMaintenanceLogs() {
      const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/maintenance-logs`, {
          headers: await getHeaders(null),
      });
      if (!response.ok) throw new Error("Failed to fetch all maintenance logs");
      return response.json();
  },

  async saveMaintenanceLog(log: unknown) {
      const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/maintenance-logs`, {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify(log)
      });
      if (!response.ok) throw new Error("Failed to save maintenance log");
      return response.json();
  },

  async getMaintenanceSchedule(vehicleId: string) {
      const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/maintenance-schedule/${vehicleId}`, {
          headers: await getHeaders(null),
      });
      if (!response.ok) throw new Error("Failed to fetch maintenance schedule");
      return response.json() as Promise<{
        catalogId: string | null;
        catalogMatched: boolean;
        maintenanceStatus: {
          status: string;
          nextTypeLabel: string;
          daysToService: number;
          nextOdo: number;
          remainingKm: number;
        };
        schedule: unknown[];
      }>;
  },

  async bootstrapMaintenanceSchedule(vehicleId: string, currentOdometer?: number) {
      const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/maintenance-schedule/${vehicleId}/bootstrap`, {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify({ currentOdometer: currentOdometer ?? null }),
      });
      if (!response.ok) throw new Error("Failed to bootstrap maintenance schedule");
      return response.json() as Promise<{ created: number; catalogId?: string; message?: string }>;
  },

  async getMaintenanceFleetSummary() {
      const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/maintenance-fleet-summary`, {
          headers: await getHeaders(null),
      });
      if (!response.ok) throw new Error("Failed to fetch maintenance fleet summary");
      return response.json() as Promise<{
        items: Array<{
          vehicleId: string;
          licensePlate?: string;
          make?: string;
          model?: string;
          year?: string;
          odometer: number;
          fleetStatus: string;
          nextDueOdometer: number | null;
          scheduleRowCount: number;
        }>;
      }>;
  },

  async getTollTags() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/toll-tags`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch toll tags");
    return response.json();
  },

  async saveTollTag(tag: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/toll-tags`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(tag)
    });
    if (!response.ok) throw new Error("Failed to save toll tag");
    return response.json();
  },

  async deleteTollTag(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/toll-tags/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete toll tag");
    return response.json();
  },

  // -----------------------------------------------------------------------
  // Toll Plaza CRUD (Phase 3 — Toll Database)
  // -----------------------------------------------------------------------

  async getTollPlazas(): Promise<TollPlaza[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/toll-plazas`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch toll plazas");
    return response.json();
  },

  async getTollPlaza(id: string): Promise<TollPlaza> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/toll-plazas/${id}`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch toll plaza");
    return response.json();
  },

  async saveTollPlaza(plaza: Partial<TollPlaza>): Promise<{ success: boolean; data: TollPlaza }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/toll-plazas`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(plaza)
    });
    if (!response.ok) throw new Error("Failed to save toll plaza");
    return response.json();
  },

  async deleteTollPlaza(id: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/toll-plazas/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete toll plaza");
  },

  async getUsers() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/users`, {
        headers: await getHeaders(null)
    });
    if (!response.ok) throw new Error("Failed to fetch users");
    return response.json();
  },

  async updateUserPassword(userId: string, password: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/update-password`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ userId, password })
    });
    if (!response.ok) throw new Error("Failed to update password");
    return response.json();
  },

  async updateUser(userId: string, fields: { name?: string; role?: string }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/update-user`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ userId, ...fields })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update user");
    }
    return response.json();
  },

  // ─── Phase 9: Team Management API ──────────────────────────────────────────

  async teamInvite(data: { email: string; name: string; role: string }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/team/invite`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to invite team member");
    }
    return response.json();
  },

  async getTeamMembers() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/team/members`, {
      headers: await getHeaders(null)
    });
    if (!response.ok) throw new Error("Failed to fetch team members");
    return response.json();
  },

  async updateTeamMemberRole(userId: string, role: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/team/members/${userId}/role`, {
      method: 'PUT',
      headers: await getHeaders(),
      body: JSON.stringify({ role })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update role");
    }
    return response.json();
  },

  async removeTeamMember(userId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/team/members/${userId}`, {
      method: 'DELETE',
      headers: await getHeaders(null)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to remove team member");
    }
    return response.json();
  },

  // Phase 10: Claim an unlinked driver by email
  async claimDriver(driverEmail: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/team/claim-driver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ driverEmail })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to claim driver");
    }
    return response.json();
  },

  async parseTollCsvWithAI(csvContent: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.ai}/parse-toll-csv`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ csvContent })
    });
    if (!response.ok) throw new Error("Failed to parse toll CSV");
    return response.json();
  },

  async parseTollImageWithAI(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetchWithRetry(`${API_ENDPOINTS.ai}/parse-toll-image`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: formData
    });
    
    if (!response.ok) {
        throw new Error("Failed to parse toll image");
    }
    return response.json();
  },

  async scanOdometerWithAI(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetchWithRetry(`${API_ENDPOINTS.ai}/scan-odometer`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: formData
    });
    
    if (!response.ok) {
        throw new Error("Failed to scan odometer");
    }
    return response.json();
  },

  async getClaims(driverId?: string) {
    const url = driverId 
        ? `${API_ENDPOINTS.financial}/claims?driverId=${driverId}` 
        : `${API_ENDPOINTS.financial}/claims`;
    const response = await fetchWithRetry(url, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch claims");
    return response.json();
  },

  async saveClaim(claim: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/claims`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(claim)
    });
    if (!response.ok) throw new Error("Failed to save claim");
    return response.json();
  },

  async deleteClaim(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/claims/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete claim");
    return response.json();
  },

  async getCheckIns(weekStart?: string) {
    let url = `${API_ENDPOINTS.fleet}/check-ins`;
    if (weekStart) {
        url += `?weekStart=${weekStart}`;
    }
    const response = await fetchWithRetry(url, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch check-ins");
    return response.json();
  },

  async reconcileTollTransaction(transaction: FinancialTransaction, trip: Trip) {
    // 1. Update Transaction: Link to trip and mark reconciled
    // Auto-assign driver from the matched trip to ensure data consistency
    const updatedTx = { 
        ...transaction, 
        tripId: trip.id, 
        isReconciled: true,
        driverId: trip.driverId,
        driverName: trip.driverName
    };
    await this.saveTransaction(updatedTx);

    // 2. Return updated objects
    // Note: We DO NOT update the trip's tollCharges. 
    // The Trip record from the platform (Uber/Lyft) is the Source of Truth for revenue.
    // Linking a toll expense is for verification/audit, not for modifying the Trip invoice.
    return { transaction: updatedTx, trip };
  },

  async approveExpense(
    id: string,
    notes?: string,
    odometerReading?: number,
    stationOpts?: { matchedStationId?: string; stationLocation?: string }
  ) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/expenses/approve`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({
            id,
            notes,
            odometerReading,
            ...(stationOpts?.matchedStationId ? { matchedStationId: stationOpts.matchedStationId } : {}),
            ...(stationOpts?.stationLocation ? { stationLocation: stationOpts.stationLocation } : {}),
        })
    });
    if (!response.ok) throw new Error("Failed to approve expense");
    const result = await response.json();
    return result.data || result;
  },

  async rejectExpense(id: string, reason?: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/expenses/reject`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ id, reason })
    });
    if (!response.ok) throw new Error("Failed to reject expense");
    const result = await response.json();
    return result.data || result;
  },

  async unreconcileTollTransaction(transaction: FinancialTransaction, trip: Trip) {
    // 1. Update Transaction: Remove link
    // We explicitly set tripId to null to break the relationship
    const txToSave = { ...transaction, tripId: null, isReconciled: false };
    
    // Note: We cast to any because Typescript might complain about null if defined as string, 
    // but JSON allows null and Supabase treats it as clearing the field.
    await this.saveTransaction(txToSave as any);

    // 2. Return updated objects
    // Note: We DO NOT modify the trip's financials.
    return { transaction: txToSave, trip };
  },

  // ── Phase 4: Server-side Toll Reconciliation API ──────────────────────

  async getTollLogs(params?: {
    vehicleId?: string;
    tagNumber?: string;
    driverId?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.vehicleId) qs.set('vehicleId', params.vehicleId);
    if (params?.tagNumber) qs.set('tagNumber', params.tagNumber);
    if (params?.driverId) qs.set('driverId', params.driverId);
    if (params?.category) qs.set('category', params.category);
    if (params?.limit !== undefined) qs.set('limit', params.limit.toString());
    if (params?.offset !== undefined) qs.set('offset', params.offset.toString());
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/toll-reconciliation/toll-logs?${qs.toString()}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch toll logs");
    return response.json();
  },

  async getTollUnreconciled(params?: { driverId?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.driverId) qs.set('driverId', params.driverId);
    if (params?.limit !== undefined) qs.set('limit', params.limit.toString());
    if (params?.offset !== undefined) qs.set('offset', params.offset.toString());
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/toll-reconciliation/unreconciled?${qs.toString()}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch unreconciled tolls");
    return response.json();
  },

  async getTollReconciled(params?: { driverId?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.driverId) qs.set('driverId', params.driverId);
    if (params?.limit !== undefined) qs.set('limit', params.limit.toString());
    if (params?.offset !== undefined) qs.set('offset', params.offset.toString());
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/toll-reconciliation/reconciled?${qs.toString()}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch reconciled tolls");
    return response.json();
  },

  async getTollUnclaimedRefunds(params?: { driverId?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.driverId) qs.set('driverId', params.driverId);
    if (params?.limit !== undefined) qs.set('limit', params.limit.toString());
    if (params?.offset !== undefined) qs.set('offset', params.offset.toString());
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/toll-reconciliation/unclaimed-refunds?${qs.toString()}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch unclaimed refunds");
    return response.json();
  },

  async serverReconcileToll(transactionId: string, tripId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/toll-reconciliation/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ transactionId, tripId })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to reconcile toll");
    }
    return response.json();
  },

  async serverUnreconcileToll(transactionId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/toll-reconciliation/unreconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ transactionId })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to unreconcile toll");
    }
    return response.json();
  },

  async bulkReconcileTolls(matches: Array<{ transactionId: string; tripId: string }>) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/toll-reconciliation/bulk-reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ matches })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to bulk reconcile tolls");
    }
    return response.json();
  },

  async approveToll(transactionId: string, notes?: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/toll-reconciliation/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ transactionId, notes })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to approve toll");
    }
    const result = await response.json();
    return result.data || result;
  },

  async rejectToll(transactionId: string, reason?: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/toll-reconciliation/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ transactionId, reason })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to reject toll");
    }
    const result = await response.json();
    return result.data || result;
  },

  async editToll(transactionId: string, updates: Record<string, any>) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/toll-reconciliation/edit`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ transactionId, updates })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to edit toll transaction");
    }
    const result = await response.json();
    return result.data || result;
  },

  /** Set toll ledger to pending and clear trip/match fields so the row reappears under Toll Reconciliation → Unmatched. */
  async resetTollForReconciliation(transactionId: string) {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/toll-reconciliation/reset-for-reconciliation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ transactionId }),
      },
    );
    if (!response.ok) {
      const status = response.status;
      const bodyText = await response.text().catch(() => '');
      let msg = `Failed to reset toll for reconciliation (HTTP ${status})`;
      try {
        const parsed = JSON.parse(bodyText || '{}') as { error?: string };
        if (parsed?.error && typeof parsed.error === 'string') {
          msg = parsed.error;
        }
      } catch {
        const t = bodyText?.trim();
        if (t) msg = t.length > 200 ? `${t.slice(0, 200)}…` : t;
      }
      throw new Error(msg);
    }
    return response.json();
  },

  /** Fetch ALL toll transactions (flattened) for CSV export — no pagination. */
  async getTollTransactionsExport(organizationId?: string): Promise<any[]> {
    const url = organizationId 
      ? `${API_ENDPOINTS.financial}/toll-reconciliation/export?organizationId=${organizationId}`
      : `${API_ENDPOINTS.financial}/toll-reconciliation/export`;
    const response = await fetchWithRetry(url, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to fetch toll transactions export");
    }
    const result = await response.json();
    return result.data || [];
  },

  /** IDEA 2: unified toll financial events (multi-source read model). */
  async getTollUnifiedEvents(params?: {
    driverId?: string;
    from?: string;
    to?: string;
    kinds?: string;
    batchId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    success: boolean;
    data: import("../types/tollFinancialEvent").TollFinancialEvent[];
    meta: import("../types/tollFinancialEvent").TollUnifiedEventsMeta;
  }> {
    const qs = new URLSearchParams();
    if (params?.driverId) qs.set("driverId", params.driverId);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.kinds) qs.set("kinds", params.kinds);
    if (params?.batchId) qs.set("batchId", params.batchId);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/toll-reconciliation/unified-events?${qs.toString()}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || "Failed to fetch unified toll events");
    }
    return response.json();
  },

  /** CSV attachment — same query params as getTollUnifiedEvents. */
  async getTollUnifiedEventsExportCsv(params?: {
    driverId?: string;
    from?: string;
    to?: string;
    kinds?: string;
    batchId?: string;
    limit?: number;
    offset?: number;
  }): Promise<string> {
    const qs = new URLSearchParams();
    if (params?.driverId) qs.set("driverId", params.driverId);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.kinds) qs.set("kinds", params.kinds);
    if (params?.batchId) qs.set("batchId", params.batchId);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/toll-reconciliation/unified-events/export?${qs.toString()}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || "Failed to export unified toll events");
    }
    return response.text();
  },

  // ── Dispute Refunds ────────────────────────────────────────────────────

  async importDisputeRefunds(refunds: DisputeRefund[]): Promise<{ imported: number; skipped: number; total: number; message: string }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/dispute-refunds/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ refunds })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to import dispute refunds");
    }
    return response.json();
  },

  async getDisputeRefunds(params?: { status?: string; driverId?: string; dateFrom?: string; dateTo?: string }): Promise<{ data: DisputeRefund[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.driverId) qs.set('driverId', params.driverId);
    if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params?.dateTo) qs.set('dateTo', params.dateTo);
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/dispute-refunds?${qs.toString()}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to fetch dispute refunds");
    }
    return response.json();
  },

  async matchDisputeRefund(refundId: string, tollTransactionId: string, claimId?: string): Promise<{ data: DisputeRefund }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/dispute-refunds/${refundId}/match`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ tollTransactionId, claimId })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to match dispute refund");
    }
    return response.json();
  },

  async unmatchDisputeRefund(refundId: string): Promise<{ data: DisputeRefund }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/dispute-refunds/${refundId}/unmatch`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({})
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to unmatch dispute refund");
    }
    return response.json();
  },

  async getDisputeRefundSuggestions(refundId: string): Promise<{ suggestions: Array<{ tollId: string; tripId: string | null; tollAmount: number; uberRefund: number; variance: number; date: string; confidence: number; claimId: string | null; claimStatus: string | null }> }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/dispute-refunds/suggestions/${refundId}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to fetch dispute refund suggestions");
    }
    return response.json();
  },

  async getPerformanceReport(startDate: string, endDate: string, options?: { dailyRideTarget?: number, dailyEarningsTarget?: number, summaryOnly?: boolean, limit?: number, offset?: number }): Promise<{ data: any[], total: number, limit: number, offset: number }> {
    const params = new URLSearchParams({ startDate, endDate });
    if (options?.dailyRideTarget) params.append('dailyRideTarget', options.dailyRideTarget.toString());
    if (options?.dailyEarningsTarget) params.append('dailyEarningsTarget', options.dailyEarningsTarget.toString());
    if (options?.summaryOnly !== undefined) params.append('summaryOnly', options.summaryOnly.toString());
    if (options?.limit !== undefined) params.append('limit', options.limit.toString());
    if (options?.offset !== undefined) params.append('offset', options.offset.toString());

    const response = await fetchWithRetry(`${API_ENDPOINTS.ai}/performance-report?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch performance report");
    return response.json();
  },

  async resetDataByDate(payload: { 
    type?: 'upload' | 'record', 
    startDate?: string, 
    endDate?: string, 
    targets?: ('trips' | 'transactions')[],
    driverId?: string,
    preview?: boolean,
    keys?: string[]
  }) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/reset-by-date`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        throw new Error("Failed to reset data by date");
    }
    
    return response.json();
  },

  async getFuelEntriesByVehicle(vehicleId: string): Promise<any[]> {
    // Check both potential key formats in the database for backward compatibility
    const [resUnderscore, resHyphen] = await Promise.all([
      fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries?vehicleId=${vehicleId}&limit=1000`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      }),
      fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries?vehicleId=${vehicleId}&prefix=fuel-entry&limit=1000`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      })
    ]);

    const dataUnderscore = resUnderscore.ok ? await resUnderscore.json() : [];
    const dataHyphen = resHyphen.ok ? await resHyphen.json() : [];
    
    const combined = [...dataUnderscore, ...dataHyphen];
    // Deduplicate by ID
    return Array.from(new Map(combined.map(item => [item.id, item])).values());
  },

  async getCheckInsByVehicle(vehicleId: string): Promise<any[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/check-ins`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch check-ins");
    const checkIns = await response.json();
    return checkIns.filter((c: any) => c.vehicleId === vehicleId);
  },

  async runChaosSeeder(count: number, vehicleId?: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/chaos-seeder`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ count, vehicleId })
    });
    if (!response.ok) throw new Error("Chaos seeder failed");
    return response.json();
  },

  async purgeSyntheticData() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/purge-synthetic`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        }
    });
    if (!response.ok) throw new Error("Purge failed");
    return response.json();
  },

  async backfillFuelIntegrity() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/backfill-fuel-integrity`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Backfill failed");
    return response.json();
  },

  async backfillWalletCredits(): Promise<{ success: boolean; created: number; skipped: number; total: number }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel/backfill-wallet-credits`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || "Wallet credit backfill failed");
    }
    return response.json();
  },



  async lockTransaction(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/transactions/${id}/lock`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to lock transaction");
    return response.json();
  },

  async deleteCheckIn(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/check-ins/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete check-in");
    return response.json();
  },

  async deleteMaintenanceLog(id: string, vehicleId: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/maintenance-logs/${vehicleId}/${id}`, {
        method: 'DELETE',
        headers: await getHeaders(null),
    });
    if (!response.ok) throw new Error("Failed to delete maintenance log");
    return response.json();
  },

  async deleteFuelEntry(id: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete fuel entry");
    return response.json();
  },

  async getAllFuelEntries(organizationId?: string) {
    const url = organizationId
      ? `${API_ENDPOINTS.fuel}/fuel-entries?organizationId=${organizationId}`
      : `${API_ENDPOINTS.fuel}/fuel-entries`;
    const response = await fetchWithRetry(url, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch fuel entries");
    return response.json();
  },

  async getForensicErrorLogs() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/system/audit-trail`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch forensic logs");
    return response.json();
  },

  async signAuditReport(reportData: any) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/audit/sign-report`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ reportData, reportType: 'forensic-audit' })
    });
    if (!response.ok) throw new Error("Failed to sign audit report");
    return response.json();
  },

  async getAuditConfig() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/audit-config`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch audit config");
    return response.json();
  },

  async saveAuditConfig(config: Record<string, any>) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/audit-config`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(config)
    });
    if (!response.ok) throw new Error("Failed to save audit config");
    return response.json();
  },

  // Phase 8 (Deadhead): Fleet-wide and per-vehicle deadhead attribution
  async getFleetDeadhead(periodStart?: string, periodEnd?: string) {
    const params = new URLSearchParams();
    if (periodStart) params.set('periodStart', periodStart);
    if (periodEnd) params.set('periodEnd', periodEnd);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-audit/deadhead/fleet${qs}`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch fleet deadhead attribution");
    return response.json();
  },

  async getVehicleDeadhead(vehicleId: string, periodStart?: string, periodEnd?: string) {
    const params = new URLSearchParams();
    if (periodStart) params.set('periodStart', periodStart);
    if (periodEnd) params.set('periodEnd', periodEnd);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-audit/deadhead/${vehicleId}${qs}`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch vehicle deadhead attribution");
    return response.json();
  },

  async recalculateAllIntegrity() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/fuel-audit/recalculate-all`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Recalculate failed");
    return response.json();
  },

  // --- Finalized Reports ---

  async getFinalizedReports(): Promise<any[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/finalized-reports`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to fetch finalized reports: ${errText}`);
    }
    return response.json();
  },

  async saveFinalizedReports(reports: any[]): Promise<{ success: boolean; saved: number }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/finalized-reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(reports)
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to save finalized reports: ${errText}`);
    }
    return response.json();
  },

  async deleteFinalizedReport(weekStart: string, vehicleId: string): Promise<void> {
    // Same date key as POST/snapshot: YYYY-MM-DD only (avoids colons in URL path + matches KV key)
    const weekKey = String(weekStart).split('T')[0];
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/finalized-reports/${encodeURIComponent(weekKey)}/${encodeURIComponent(vehicleId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to delete finalized report: ${errText}`);
    }
  },

  /**
   * One-time maintenance: delete fuel settlement transactions that no longer have a matching
   * finalized reconciliation snapshot (e.g. after deleting finalized reports before cascade-delete).
   * Always call with dryRun: true first; execute requires confirm: "CLEANUP_ORPHAN_FUEL_SETTLEMENTS".
   */
  async cleanupOrphanedFuelSettlements(opts: {
    dryRun: boolean;
    confirm?: string;
  }): Promise<{
    success: boolean;
    dryRun?: boolean;
    finalizedReportWeeks?: number;
    wouldDeleteTransactions?: number;
    wouldResetFuelEntries?: number;
    sampleTransactionIds?: string[];
    sampleFuelEntryIds?: string[];
    deletedTransactions?: number;
    resetFuelEntries?: number;
    error?: string;
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/finalized-reports/cleanup-orphaned-settlements`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          dryRun: opts.dryRun,
          ...(opts.confirm ? { confirm: opts.confirm } : {}),
        }),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Cleanup request failed');
    }
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════
  // LEDGER API
  // ═══════════════════════════════════════════════════════════════════

  async getLedgerEntries(params: LedgerFilterParams = {}): Promise<PaginatedLedgerResponse> {
    const qp = new URLSearchParams();
    if (params.driverId) qp.set('driverId', params.driverId);
    if (params.driverIds?.length) qp.set('driverIds', params.driverIds.join(','));
    if (params.vehicleId) qp.set('vehicleId', params.vehicleId);
    if (params.startDate) qp.set('startDate', params.startDate);
    if (params.endDate) qp.set('endDate', params.endDate);
    if (params.eventType) qp.set('eventType', params.eventType);
    if (params.eventTypes?.length) qp.set('eventTypes', params.eventTypes.join(','));
    if (params.direction) qp.set('direction', params.direction);
    if (params.platform) qp.set('platform', params.platform);
    if (params.isReconciled !== undefined) qp.set('isReconciled', String(params.isReconciled));
    if (params.batchId) qp.set('batchId', params.batchId);
    if (params.sourceType) qp.set('sourceType', params.sourceType);
    if (params.minAmount !== undefined) qp.set('minAmount', String(params.minAmount));
    if (params.maxAmount !== undefined) qp.set('maxAmount', String(params.maxAmount));
    if (params.searchTerm) qp.set('searchTerm', params.searchTerm);
    if (params.limit) qp.set('limit', String(params.limit));
    if (params.offset) qp.set('offset', String(params.offset));
    if (params.sortBy) qp.set('sortBy', params.sortBy);
    if (params.sortDir) qp.set('sortDir', params.sortDir);

    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger?${qp.toString()}`,
      { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ledger query failed: ${errText}`);
    }
    return response.json();
  },

  async getLedgerCount(): Promise<{
    ledgerEntries: number;
    trips: number;
    transactions: number;
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/count`,
      { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
    );
    if (!response.ok) throw new Error('Failed to fetch ledger count');
    return response.json();
  },

  /** One-time: delete all legacy `ledger:%` KV rows. Requires `data.backfill` and session auth. */
  async purgeAllLegacyLedger(opts: { dryRun?: boolean; confirm?: string }): Promise<{
    success: boolean;
    dryRun: boolean;
    legacyKeysFound: number;
    deletedCount: number;
  }> {
    const headers = await getHeaders('application/json');
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/ledger/purge-legacy-all`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dryRun: !!opts.dryRun,
        ...(opts.confirm ? { confirm: opts.confirm } : {}),
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to purge legacy ledger');
    }
    return response.json();
  },

  /** Strips stuck Uber payment metrics + Uber `ledger_event:*` rows (resolves Roam id + `uberDriverId` from `driver:*`). */
  async stripUberPaymentDriverMetrics(driverId: string): Promise<{
    success: boolean;
    resolvedAliases?: string[];
    deletedDriverMetricKeys?: number;
    deletedLedgerEventKeys?: number;
    deletedIdempotencyKeys?: number;
    /** @deprecated use deletedDriverMetricKeys */
    deletedKeys?: number;
  }> {
    const headers = await getHeaders('application/json');
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/maintenance/strip-uber-payment-driver-metrics`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ driverId }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to strip Uber payment driver metrics');
    }
    const json = await response.json();
    return {
      ...json,
      deletedKeys: json.deletedDriverMetricKeys ?? json.deletedKeys,
    };
  },

  async getLedgerSummary(params: Partial<LedgerFilterParams> = {}): Promise<any> {
    const qp = new URLSearchParams();
    if (params.driverId) qp.set('driverId', params.driverId);
    if (params.driverIds?.length) qp.set('driverIds', params.driverIds.join(','));
    if (params.startDate) qp.set('startDate', params.startDate);
    if (params.endDate) qp.set('endDate', params.endDate);
    if (params.eventType) qp.set('eventType', params.eventType);
    if (params.direction) qp.set('direction', params.direction);
    if (params.platform) qp.set('platform', params.platform);

    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/summary?${qp.toString()}`,
      { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ledger summary failed: ${errText}`);
    }
    return response.json();
  },

  /**
   * Get statement summaries for one or all platforms
   * - Uber: Aggregates from statement_line, payout_cash, payout_bank events
   * - Roam/InDrive: Computed from fare_earning, tip, promotion, toll_charge events
   */
  async getStatementSummary(params: {
    platform?: 'Uber' | 'Roam' | 'InDrive' | 'all';
    startDate: string;
    endDate: string;
    driverId?: string;
  }): Promise<{
    success: boolean;
    summaries: Array<{
      platform: 'Uber' | 'Roam' | 'InDrive';
      periodStart: string;
      periodEnd: string;
      sourceType: 'csv_import' | 'computed';
      netFare: number;
      promotions: number;
      tips: number;
      totalEarnings: number;
      tolls: number;
      tollAdjustments: number;
      totalRefundsExpenses: number;
      periodAdjustments: number;
      cashCollected: number;
      bankTransfer: number;
      totalPayout: number;
      tripCount?: number;
    }>;
    periodStart: string;
    periodEnd: string;
  }> {
    const qp = new URLSearchParams();
    qp.set('startDate', params.startDate);
    qp.set('endDate', params.endDate);
    if (params.platform) qp.set('platform', params.platform);
    if (params.driverId) qp.set('driverId', params.driverId);

    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/statement-summary?${qp.toString()}`,
      { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Statement summary failed: ${errText}`);
    }
    return response.json();
  },

  async getLedgerDriverOverview(params: {
    driverId: string;
    startDate: string;
    endDate: string;
    platforms?: string[];
  }): Promise<LedgerDriverOverview> {
    const qp = new URLSearchParams();
    qp.set('driverId', params.driverId);
    qp.set('startDate', params.startDate);
    qp.set('endDate', params.endDate);
    if (params.platforms?.length) qp.set('platforms', params.platforms.join(','));

    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/driver-overview?${qp.toString()}`,
      { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
    );
    if (!response.ok) {
      const msg = await parseFinancialApiErrorBody(response);
      throw new Error(`Ledger driver overview failed: ${msg}`);
    }
    const json = await response.json();
    return json.data;
  },

  /** Deep read-only compare: completed money trips vs `ledger_event:*` fare rows. */
  async getLedgerTripLedgerGapDiagnostic(params: {
    driverId: string;
    startDate: string;
    endDate: string;
  }): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || publicAnonKey;
    const qp = new URLSearchParams();
    qp.set('driverId', params.driverId);
    qp.set('startDate', params.startDate);
    qp.set('endDate', params.endDate);
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/diagnostic-trip-ledger-gap?${qp.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      const msg = await parseFinancialApiErrorBody(response);
      throw new Error(`Trip/ledger gap diagnostic failed: ${msg}`);
    }
    return response.json();
  },

  async getDriverIndriveWallet(params: {
    driverId: string;
    startDate: string;
    endDate: string;
  }): Promise<IndriveWalletSummary> {
    const qp = new URLSearchParams();
    qp.set('driverId', params.driverId);
    qp.set('startDate', params.startDate);
    qp.set('endDate', params.endDate);
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/driver-indrive-wallet?${qp.toString()}`,
      { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
    );
    if (!response.ok) {
      const msg = await parseFinancialApiErrorBody(response);
      throw new Error(`InDrive wallet summary failed: ${msg}`);
    }
    const json = await response.json();
    if (!json?.data) throw new Error('InDrive wallet summary: empty response');
    return json.data as IndriveWalletSummary;
  },

  async createLedgerEntry(entry: Partial<LedgerEntry>): Promise<{ success: boolean; data?: LedgerEntry; skipped?: boolean; message?: string }> {
    console.log('[Ledger] Creating entry:', entry.eventType, entry.sourceType, entry.sourceId);
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(entry),
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ledger create failed: ${errText}`);
    }
    return response.json();
  },

  async createLedgerBatch(entries: Partial<LedgerEntry>[]): Promise<{ success: boolean; created: number; skipped: number; total: number }> {
    console.log(`[Ledger] Creating batch of ${entries.length} entries`);
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/batch`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ entries }),
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ledger batch create failed: ${errText}`);
    }
    return response.json();
  },

  /** Phase 2: idempotent canonical ledger events (`ledger_event:*`). Same idempotencyKey → skipped on retry. */
  async appendCanonicalLedgerEvents(
    events: CanonicalLedgerEventInput[],
  ): Promise<AppendCanonicalLedgerResult> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/canonical-events/append`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ events }),
      },
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Canonical ledger append failed: ${errText}`);
    }
    return response.json();
  },

  /** Remove canonical ledger_event rows for sourceType + sourceIds (after deleting trips / ops rows). */
  async deleteLedgerBySource(payload: {
    sourceType: string;
    sourceIds: string[];
  }): Promise<{ success: boolean; deleted: number; idemDeleted: number }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/ledger/delete-by-source`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'deleteLedgerBySource failed');
    }
    return response.json();
  },

  /** Dry-run: list canonical ledger rows whose source trip/transaction/fuel/toll row is missing. Requires session + data.backfill. */
  async ledgerSourceOrphanAudit(): Promise<{
    success: boolean;
    scanned: number;
    orphanCount: number;
    orphans: Array<{
      key: string;
      id: string;
      sourceType: string;
      sourceId: string;
      eventType?: string;
    }>;
  }> {
    const headers = await getHeaders(null);
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/admin/ledger-source-orphan-audit`, {
      headers,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Orphan audit failed');
    }
    return response.json();
  },

  /** Remove orphaned ledger_event rows (optional dryRun). Requires session + data.backfill. */
  async ledgerSourceOrphanCleanup(payload: {
    dryRun?: boolean;
    confirm?: string;
  }): Promise<{
    success: boolean;
    dryRun?: boolean;
    scanned?: number;
    deleted?: number;
    idemDeleted?: number;
    sourceGroups?: Record<string, number>;
    distinctSourceIds?: number;
  }> {
    const headers = await getHeaders('application/json');
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/admin/ledger-source-orphan-cleanup`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Orphan cleanup failed');
    }
    return response.json();
  },

  async getCanonicalLedgerEvents(params: {
    driverId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    data: Record<string, unknown>[];
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const qp = new URLSearchParams();
    if (params.driverId) qp.set('driverId', params.driverId);
    if (params.startDate) qp.set('startDate', params.startDate);
    if (params.endDate) qp.set('endDate', params.endDate);
    if (params.limit != null) qp.set('limit', String(params.limit));
    if (params.offset != null) qp.set('offset', String(params.offset));
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/canonical-events?${qp.toString()}`,
      { headers: { 'Authorization': `Bearer ${publicAnonKey}` } },
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Canonical ledger query failed: ${errText}`);
    }
    return response.json();
  },

  async updateLedgerEntry(id: string, updates: Partial<LedgerEntry>): Promise<{ success: boolean; data?: LedgerEntry }> {
    console.log('[Ledger] Updating entry:', id, Object.keys(updates));
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(updates),
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ledger update failed: ${errText}`);
    }
    return response.json();
  },

  async deleteLedgerEntry(id: string): Promise<{ success: boolean }> {
    console.log('[Ledger] Deleting entry:', id);
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` },
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ledger delete failed: ${errText}`);
    }
    return response.json();
  },

  async getLedgerEarningsHistory(params: {
    driverId: string;
    periodType?: 'daily' | 'weekly' | 'monthly';
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; data: any[]; durationMs: number; readModel?: string }> {
    const qp = new URLSearchParams();
    qp.set('driverId', params.driverId);
    if (params.periodType) qp.set('periodType', params.periodType);
    if (params.startDate) qp.set('startDate', params.startDate);
    if (params.endDate) qp.set('endDate', params.endDate);

    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/ledger/driver-earnings-history?${qp.toString()}`,
      { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ledger earnings history failed: ${errText}`);
    }
    return response.json();
  },

  async runLedgerBackfill(): Promise<{ success: boolean; stats: { tripsProcessed: number; tripsSkipped: number; txProcessed: number; txSkipped: number; ledgerCreated: number; errors: number } }> {
    console.log('[Ledger] Starting backfill...');
    const response = await fetch(
      `${API_ENDPOINTS.financial}/ledger/backfill`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ledger backfill failed: ${errText}`);
    }
    const result = await response.json();
    console.log('[Ledger] Backfill complete:', result);
    return result;
  },

  // Phase 6.3: Targeted per-driver ledger repair
  async repairDriverLedger(driverId: string, tripIds?: string[], force?: boolean): Promise<{ success: boolean; driverId: string; stats: any; durationMs: number }> {
    console.log(`[Ledger] Starting ${force ? 'FORCE ' : ''}repair for driver ${driverId}${tripIds ? ` with ${tripIds.length} client-supplied tripIds` : ''}...`);
    const response = await fetch(
      `${API_ENDPOINTS.financial}/ledger/repair-driver`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ driverId, ...(tripIds ? { tripIds } : {}), ...(force ? { force: true } : {}) }),
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ledger repair failed: ${errText}`);
    }
    const result = await response.json();
    console.log('[Ledger] Repair complete:', result);
    return result;
  },

  /**
   * After import: optional call to legacy ensure endpoint (trip→`ledger:%` writes are retired; expect 403 or no-op).
   * Canonical money is written via `ledger_event:*` append in import flows. Chunks large id lists for Edge limits.
   */
  async ensureLedgerFromTripIds(
    tripIds: string[],
  ): Promise<{ success: boolean; stats: Record<string, number>; durationMs: number }> {
    const ids = [...new Set(tripIds.map((id) => String(id).trim()).filter(Boolean))];
    if (ids.length === 0) {
      return { success: true, stats: {}, durationMs: 0 };
    }
    const SLICE = 10_000;
    let durationMs = 0;
    const agg: Record<string, number> = {
      tripIdsRequested: 0,
      tripsLoaded: 0,
      skippedNoMoney: 0,
      ledgerRowsWritten: 0,
      unresolvedAfterGenerate: 0,
      errors: 0,
      forceDeleted: 0,
    };
    for (let i = 0; i < ids.length; i += SLICE) {
      const url = `${API_ENDPOINTS.fleet}/ledger/ensure-from-trip-ids`;
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ tripIds: ids.slice(i, i + SLICE) }),
      });
      if (!response.ok) {
        const msg = await parseFinancialApiErrorBody(response);
        throw new Error(`Ledger ensure-from-trip-ids failed: ${msg}`);
      }
      const json = await response.json();
      durationMs += Number(json.durationMs) || 0;
      const st = json.stats || {};
      for (const key of Object.keys(agg)) {
        if (typeof st[key] === 'number') agg[key] += st[key];
      }
    }
    return { success: true, stats: agg, durationMs };
  },

  // Phase 2 Diagnostic: Cash field inspection for a driver's stored trips
  async getCashDiagnostic(driverId: string): Promise<any> {
    const response = await fetch(
      `${API_ENDPOINTS.financial}/ledger/cash-diagnostic/${driverId}`,
      {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` },
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cash diagnostic failed: ${errText}`);
    }
    return response.json();
  },

  // ─── Bulk Delete ─────────────────────────────────────────────────────

  async bulkDeletePreview(payload: {
    prefix: string;
    startDate?: string;
    endDate?: string;
    dateField?: string;
    driverId?: string;
    platform?: string;
    fields?: string[];
  }): Promise<{ items: any[]; totalCount: number }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/bulk-delete-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Bulk delete preview failed (${response.status})`);
    }
    return response.json();
  },

  async bulkDeleteExecute(payload: {
    keys: string[];
    cleanupStorage?: boolean;
  }): Promise<{ success: boolean; deletedCount: number; filesDeletedCount: number }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/bulk-delete-execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Bulk delete execute failed (${response.status})`);
    }
    return response.json();
  },

  // ═══════════════════════════════════════════════════════════════════
  // Phase 1: Per-Driver Ledger Summary (for DriversPage migration)
  // ═══════════════════════════════════════════════════════════════════

  async getLedgerDriversSummary(date?: string): Promise<{
    success: boolean;
    data: Record<string, {
      lifetimeEarnings: number;
      monthlyEarnings: number;
      todayEarnings: number;
      lifetimeTripCount: number;
      monthlyTripCount: number;
      todayTripCount: number;
    }>;
    meta: {
      totalDrivers: number;
      totalEntriesProcessed: number;
      dateUsed: string;
      monthRange: string;
      skippedNoDriver: number;
      skippedBadDate: number;
      durationMs: number;
      readModel?: string;
    };
  }> {
    try {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      const qs = params.toString();
      const qp = qs ? `?${qs}` : '';
      const response = await fetchWithRetry(
        `${API_ENDPOINTS.financial}/ledger/drivers-summary${qp}`,
        { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
      );
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ledger drivers-summary failed: ${errText}`);
      }
      return response.json();
    } catch (err: any) {
      console.error('[API] getLedgerDriversSummary failed:', err.message || err);
      return {
        success: false,
        data: {},
        meta: {
          totalDrivers: 0,
          totalEntriesProcessed: 0,
          dateUsed: date || new Date().toISOString().split('T')[0],
          monthRange: '',
          skippedNoDriver: 0,
          skippedBadDate: 0,
          durationMs: 0,
        },
      };
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // Phase 3: Fleet-Wide Ledger Summary (for ExecutiveDashboard & FinancialsView)
  // ═══════════════════════════════════════════════════════════════════

  async getLedgerFleetSummary(params?: {
    days?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    success: boolean;
    data: {
      totalEarnings: number;
      totalTripCount: number;
      totalCashCollected: number;
      dailyTrend: Array<{ date: string; earnings: number; tripCount: number }>;
      topDrivers: Array<{ driverId: string; driverName: string; earnings: number; tripCount: number }>;
      platformBreakdown: Array<{ platform: string; earnings: number; tripCount: number }>;
      revenueByType: { fare: number; tip: number; promotion: number; other: number };
    };
    meta: {
      periodStart: string;
      periodEnd: string;
      totalEntriesProcessed: number;
      durationMs: number;
      readModel?: string;
    };
  }> {
    try {
      const qp = new URLSearchParams();
      if (params?.days) qp.set('days', String(params.days));
      if (params?.startDate) qp.set('startDate', params.startDate);
      if (params?.endDate) qp.set('endDate', params.endDate);
      const qs = qp.toString() ? `?${qp.toString()}` : '';
      const response = await fetchWithRetry(
        `${API_ENDPOINTS.financial}/ledger/fleet-summary${qs}`,
        { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
      );
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ledger fleet-summary failed: ${errText}`);
      }
      return response.json();
    } catch (err: any) {
      console.error('[API] getLedgerFleetSummary failed:', err.message || err);
      return {
        success: false,
        data: {
          totalEarnings: 0,
          totalTripCount: 0,
          totalCashCollected: 0,
          dailyTrend: [],
          topDrivers: [],
          platformBreakdown: [],
          revenueByType: { fare: 0, tip: 0, promotion: 0, other: 0 },
        },
        meta: {
          periodStart: '',
          periodEnd: '',
          totalEntriesProcessed: 0,
          durationMs: 0,
        },
      };
    }
  },

  // ========================================================================
  // Unverified Vendors API
  // ========================================================================

  async getUnverifiedVendors(status?: 'pending' | 'resolved'): Promise<{
    vendors: any[];
    summary: {
      total: number;
      pending: number;
      resolved: number;
      totalAmountAtRisk: number;
    };
  }> {
    const url = status 
      ? `${API_ENDPOINTS.fuel}/unverified-vendors?status=${status}`
      : `${API_ENDPOINTS.fuel}/unverified-vendors`;
    
    const response = await fetchWithRetry(url, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to fetch unverified vendors: ${errText}`);
    }
    
    return response.json();
  },

  async getUnverifiedVendorById(vendorId: string): Promise<{
    vendor: any;
    transactions: any[];
    drivers: any[];
    vehicles: any[];
    suggestedMatches: any[];
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/unverified-vendors/${vendorId}`,
      {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to fetch vendor details: ${errText}`);
    }
    
    return response.json();
  },

  async createUnverifiedVendor(data: {
    transactionId: string;
    vendorName: string;
    sourceType: 'no_gps' | 'unmatched_name' | 'manual_entry';
  }): Promise<{ success: boolean; vendor: any }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/unverified-vendors`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(data)
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to create vendor: ${errText}`);
    }
    
    return response.json();
  },

  async bulkCreateUnverifiedVendors(transactions: Array<{
    id: string;
    vendor: string;
    sourceType: 'no_gps' | 'unmatched_name' | 'manual_entry';
  }>): Promise<{
    success: boolean;
    vendors: any[];
    summary: {
      processedTransactions: number;
      uniqueVendors: number;
    };
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/unverified-vendors/bulk`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ transactions })
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to bulk create vendors: ${errText}`);
    }
    
    return response.json();
  },

  async resolveVendorToStation(
    vendorId: string,
    stationId: string,
    resolvedBy: string
  ): Promise<{
    success: boolean;
    vendor: any;
    station: any;
    updatedTransactions: any[];
    summary: {
      transactionsUpdated: number;
      totalAmount: number;
      resolvedAt: string;
    };
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/unverified-vendors/${vendorId}/resolve`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ stationId, resolvedBy })
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to resolve vendor: ${errText}`);
    }
    
    return response.json();
  },

  async createStationFromVendor(
    vendorId: string,
    stationData: {
      name: string;
      brand?: string;
      address?: string;
      location?: { lat: number; lng: number };
      phone?: string;
      services?: string[];
    },
    resolvedBy: string
  ): Promise<{
    success: boolean;
    newStationCreated: boolean;
    vendor: any;
    station: any;
    updatedTransactions: any[];
    summary: {
      transactionsUpdated: number;
    };
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/unverified-vendors/${vendorId}/create-station`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ stationData, resolvedBy })
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to create station: ${errText}`);
    }
    
    return response.json();
  },

  async rejectUnverifiedVendor(
    vendorId: string,
    rejectedBy: string,
    reason: string,
    action: 'flag' | 'dismiss' = 'flag'
  ): Promise<{
    success: boolean;
    vendor: any;
    updatedTransactions: any[];
    summary: {
      transactionsAffected: number;
      action: string;
      rejectedAt: string;
    };
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/unverified-vendors/${vendorId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ rejectedBy, reason, action })
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to reject vendor: ${errText}`);
    }
    
    return response.json();
  },

  // ========================================================================
  // Transaction-Level Resolution API (Individual Transaction Handling)
  // ========================================================================

  async resolveTransactionToStation(
    vendorId: string,
    transactionId: string,
    stationId: string
  ): Promise<{
    success: boolean;
    transaction: any;
    vendor: any;
    remainingTransactions: number;
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/unverified-vendors/${vendorId}/transactions/${transactionId}/resolve`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ stationId })
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to resolve transaction: ${errText}`);
    }
    
    return response.json();
  },

  async createStationFromTransaction(
    vendorId: string,
    transactionId: string,
    stationData: {
      name: string;
      brand?: string;
      address?: string;
      city?: string;
      state?: string;
    }
  ): Promise<{
    success: boolean;
    station: any;
    transaction: any;
    vendor: any;
    remainingTransactions: number;
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/unverified-vendors/${vendorId}/transactions/${transactionId}/create-station`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(stationData)
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to create station: ${errText}`);
    }
    
    return response.json();
  },

  async rejectTransaction(
    vendorId: string,
    transactionId: string,
    reason: string
  ): Promise<{
    success: boolean;
    transaction: any;
    vendor: any;
    remainingTransactions: number;
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/unverified-vendors/${vendorId}/transactions/${transactionId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ reason })
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to reject transaction: ${errText}`);
    }
    
    return response.json();
  },

  async searchStations(query: string): Promise<{ stations: any[] }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/stations/search?q=${encodeURIComponent(query)}`,
      {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to search stations: ${errText}`);
    }
    
    return response.json();
  },

  // Phase 8: Legacy Data Migration - Scan for orphaned transactions
  async scanLegacyTransactions(): Promise<{
    success: boolean;
    dryRun: boolean;
    preview: {
      totalOrphanedTransactions: number;
      totalOrphanedFuelLogs: number;
      reviewQueueCount: number;
      totalAmountAffected: number;
      transactions: any[];
    };
    message: string;
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/migrate-legacy-vendors`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ dryRun: true })
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Scan failed: ${errText}`);
    }
    
    return response.json();
  },

  // Phase 8: Process individual migration transaction
  async processMigrationTransaction(
    transactionId: string,
    action: 'create_vendor' | 'match_station' | 'skip' | 'reject',
    data?: {
      stationId?: string;
      vendorName?: string;
      resolvedBy?: string;
      reason?: string;
    }
  ): Promise<{
    success: boolean;
    action: string;
    message: string;
    vendor?: any;
    station?: any;
    transaction?: any;
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.fuel}/process-migration-transaction`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ transactionId, action, data })
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to process transaction: ${errText}`);
    }
    
    return response.json();
  },
};

/**
 * Fetches the configured fleet timezone from the server.
 * Falls back to 'America/Jamaica' if the request fails.
 */
export async function fetchFleetTimezone(): Promise<string> {
  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-37f42386/fleet-timezone`,
      {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.timezone || 'America/Jamaica';
  } catch (e) {
    console.log('Failed to fetch fleet timezone, using default:', e);
    return 'America/Jamaica';
  }
}