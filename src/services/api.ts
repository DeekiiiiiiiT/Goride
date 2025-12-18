import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Trip, Notification, ImportBatch, DriverMetrics, VehicleMetrics } from '../types/data';

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

  async getTrips(): Promise<Trip[]> {
    const response = await fetchWithRetry(`${BASE_URL}/trips`, {
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
  }
};