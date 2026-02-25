import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Trip, Notification, ImportBatch, DriverMetrics, VehicleMetrics, FinancialTransaction } from '../types/data';
import { OdometerReading } from '../types/vehicle';
import { TollPlaza } from '../types/toll';
import { API_ENDPOINTS } from './apiConfig';
import { compressImage } from '../utils/compressImage';

export interface TripFilterParams {
    driverId?: string;
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
}

export interface PaginatedTripResponse {
    data: Trip[];
    page: number;
    limit: number;
    total: number;
}

export async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, backoff = 500): Promise<Response> {
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
    // Default to a reasonable limit to prevent server crashes on large datasets
    const limit = options?.limit ?? 500;
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
        (tx.category === 'Toll Usage' || tx.category === 'Tolls') && 
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
    if (!response.ok) throw new Error("Failed to save transaction");
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
    if (!response.ok) throw new Error("Promotion failed");
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
          headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      if (!response.ok) throw new Error("Failed to fetch maintenance logs");
      return response.json();
  },

  async getAllMaintenanceLogs() {
      const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/maintenance-logs`, {
          headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      if (!response.ok) throw new Error("Failed to fetch all maintenance logs");
      return response.json();
  },

  async saveMaintenanceLog(log: any) {
      const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/maintenance-logs`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify(log)
      });
      if (!response.ok) throw new Error("Failed to save maintenance log");
      return response.json();
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
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch users");
    return response.json();
  },

  async updateUserPassword(userId: string, password: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.admin}/update-password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ userId, password })
    });
    if (!response.ok) throw new Error("Failed to update password");
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

  async approveExpense(id: string, notes?: string) {
    const response = await fetchWithRetry(`${API_ENDPOINTS.financial}/expenses/approve`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ id, notes })
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
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
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

  async getAllFuelEntries() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries`, {
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

  async recalculateAllIntegrity() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/admin/fuel-audit/recalculate-all`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Recalculate failed");
    return response.json();
  }
};