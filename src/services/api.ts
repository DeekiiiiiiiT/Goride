import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Trip, Notification, ImportBatch, DriverMetrics, VehicleMetrics } from '../types/data';
import { OdometerReading } from '../types/vehicle';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386`;

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, backoff = 500): Promise<Response> {
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
    const response = await fetchWithRetry(`${BASE_URL}/odometer-history/${vehicleId}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch odometer history");
    return response.json();
  },

  async addOdometerReading(reading: Partial<OdometerReading>) {
    const response = await fetchWithRetry(`${BASE_URL}/odometer-history`, {
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

  async deleteOdometerReading(id: string, vehicleId: string) {
    const response = await fetchWithRetry(`${BASE_URL}/odometer-history/${id}?vehicleId=${vehicleId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete odometer reading");
    return response.json();
  },

  async getBatches(): Promise<ImportBatch[]> {
    const response = await fetchWithRetry(`${BASE_URL}/batches`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch batches");
    return response.json();
  },

  async createBatch(batch: ImportBatch) {
    const response = await fetchWithRetry(`${BASE_URL}/batches`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/batches/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete batch");
    return response.json();
  },

  async saveTrips(trips: Trip[]) {
    const response = await fetchWithRetry(`${BASE_URL}/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(trips),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save trips: ${response.statusText}`);
    }
    
    return response.json();
  },

  async saveDriverMetrics(metrics: DriverMetrics[]) {
      const response = await fetchWithRetry(`${BASE_URL}/driver-metrics`, {
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
      const response = await fetchWithRetry(`${BASE_URL}/vehicle-metrics`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/vehicle-metrics`, {
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        }
    });
    if (!response.ok) throw new Error("Failed to fetch vehicle metrics");
    return response.json();
  },

  async getDriverMetrics(): Promise<DriverMetrics[]> {
    const response = await fetchWithRetry(`${BASE_URL}/driver-metrics`, {
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        }
    });
    if (!response.ok) throw new Error("Failed to fetch driver metrics");
    return response.json();
  },

  async getTrips(options?: { limit?: number, offset?: number }): Promise<Trip[]> {
    let url = `${BASE_URL}/trips`;
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.append('limit', options.limit.toString());
    if (options?.offset !== undefined) params.append('offset', options.offset.toString());
    
    if (params.toString()) {
        url += `?${params.toString()}`;
    }

    const response = await fetchWithRetry(url, {
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch trips: ${response.statusText}`);
    }
    
    return response.json();
  },

  async clearAllData() {
    const response = await fetchWithRetry(`${BASE_URL}/trips`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to clear data: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getNotifications(): Promise<Notification[]> {
    const response = await fetchWithRetry(`${BASE_URL}/notifications`, {
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

  async markNotificationAsRead(id: string) {
    const response = await fetchWithRetry(`${BASE_URL}/notifications/${id}/read`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/notifications`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/alert-rules`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch alert rules");
    return response.json();
  },

  async saveAlertRule(rule: any) {
    const response = await fetchWithRetry(`${BASE_URL}/alert-rules`, {
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
     const response = await fetchWithRetry(`${BASE_URL}/alert-rules/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete alert rule");
    return response.json();
  },

  async getIntegrations() {
    const response = await fetchWithRetry(`${BASE_URL}/settings/integrations`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch integrations");
    return response.json();
  },

  async saveIntegration(integration: any) {
    const response = await fetchWithRetry(`${BASE_URL}/settings/integrations`, {
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
      const response = await fetchWithRetry(`${BASE_URL}/budgets`, {
          headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      if (!response.ok) throw new Error("Failed to fetch budgets");
      return response.json();
  },

  async saveBudget(budget: any) {
      const response = await fetchWithRetry(`${BASE_URL}/budgets`, {
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

  async getVehicles() {
    const response = await fetchWithRetry(`${BASE_URL}/vehicles`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch vehicles");
    return response.json();
  },

  async saveVehicle(vehicle: any) {
    const response = await fetchWithRetry(`${BASE_URL}/vehicles`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/vehicles/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete vehicle");
    return response.json();
  },

  async getDrivers() {
    const response = await fetchWithRetry(`${BASE_URL}/drivers`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch drivers");
    return response.json();
  },

  async saveDriver(driver: any) {
    const response = await fetchWithRetry(`${BASE_URL}/drivers`, {
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

  async getTransactions() {
    const response = await fetchWithRetry(`${BASE_URL}/transactions`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch transactions");
    return response.json();
  },

  async saveTransaction(transaction: any) {
    const response = await fetchWithRetry(`${BASE_URL}/transactions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(transaction)
    });
    if (!response.ok) throw new Error("Failed to save transaction");
    return response.json();
  },

  async deleteTransaction(id: string) {
    const response = await fetchWithRetry(`${BASE_URL}/transactions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete transaction");
    return response.json();
  },

  async uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetchWithRetry(`${BASE_URL}/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        },
        body: formData
    });
    if (!response.ok) throw new Error("Failed to upload file");
    return response.json();
  },

  async parseDocument(file: File, type: 'license' | 'address' | 'vehicle_registration', backFile?: File) {
    const formData = new FormData();
    formData.append('file', file);
    if (backFile) {
      formData.append('backFile', backFile);
    }
    formData.append('type', type);
    
    const response = await fetchWithRetry(`${BASE_URL}/parse-document`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/generate-vehicle-image`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/settings/preferences`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch preferences");
    return response.json();
  },

  async savePreferences(preferences: any) {
    const response = await fetchWithRetry(`${BASE_URL}/settings/preferences`, {
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

  async saveFleetState(state: { 
      drivers: DriverMetrics[], 
      vehicles: VehicleMetrics[], 
      trips: Trip[], 
      financials: any,
      metadata?: any,
      insights?: any 
  }) {
      const response = await fetchWithRetry(`${BASE_URL}/fleet/sync`, {
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

  async getFinancials() {
      const response = await fetchWithRetry(`${BASE_URL}/financials`, {
          headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      if (!response.ok) throw new Error("Failed to fetch financials");
      return response.json();
  },

  async saveFinancials(financials: any) {
      const response = await fetchWithRetry(`${BASE_URL}/financials`, {
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
      const response = await fetchWithRetry(`${BASE_URL}/maintenance-logs/${vehicleId}`, {
          headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      if (!response.ok) throw new Error("Failed to fetch maintenance logs");
      return response.json();
  },

  async saveMaintenanceLog(log: any) {
      const response = await fetchWithRetry(`${BASE_URL}/maintenance-logs`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/toll-tags`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch toll tags");
    return response.json();
  },

  async saveTollTag(tag: any) {
    const response = await fetchWithRetry(`${BASE_URL}/toll-tags`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/toll-tags/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete toll tag");
    return response.json();
  },

  async getUsers() {
    const response = await fetchWithRetry(`${BASE_URL}/users`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch users");
    return response.json();
  },

  async parseTollCsvWithAI(csvContent: string) {
    const response = await fetchWithRetry(`${BASE_URL}/ai/parse-toll-csv`, {
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

    const response = await fetchWithRetry(`${BASE_URL}/ai/parse-toll-image`, {
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

  async getClaims(driverId?: string) {
    const url = driverId 
        ? `${BASE_URL}/claims?driverId=${driverId}` 
        : `${BASE_URL}/claims`;
    const response = await fetchWithRetry(url, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch claims");
    return response.json();
  },

  async saveClaim(claim: any) {
    const response = await fetchWithRetry(`${BASE_URL}/claims`, {
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

  async reconcileTollTransaction(transaction: FinancialTransaction, trip: Trip) {
    // 1. Update Transaction: Link to trip and mark reconciled
    const updatedTx = { ...transaction, tripId: trip.id, isReconciled: true };
    await this.saveTransaction(updatedTx);

    // 2. Return updated objects
    // Note: We DO NOT update the trip's tollCharges. 
    // The Trip record from the platform (Uber/Lyft) is the Source of Truth for revenue.
    // Linking a toll expense is for verification/audit, not for modifying the Trip invoice.
    return { transaction: updatedTx, trip };
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
  }
};