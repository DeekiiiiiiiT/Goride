import { projectId, publicAnonKey } from '../utils/supabase/info';
import { FuelCard, FuelEntry, MileageAdjustment, FuelScenario } from '../types/fuel';
import { FinancialTransaction } from '../types/data';
import { API_ENDPOINTS } from './apiConfig';
import { settlementService } from './settlementService';

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, backoff = 500): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (response.status >= 500 && retries > 0) {
        throw new Error(`Server error: ${response.status}`);
    }
    return response;
  } catch (err) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}

export const fuelService = {
  // --- Fuel Cards ---
  async getFuelCards(): Promise<FuelCard[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-cards`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch fuel cards");
    return response.json();
  },

  async saveFuelCard(card: FuelCard): Promise<FuelCard> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(card)
    });
    if (!response.ok) throw new Error("Failed to save fuel card");
    const result = await response.json();
    return result.data || result;
  },

  async deleteFuelCard(id: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-cards/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete fuel card");
  },

  // --- Fuel Entries ---
  async getFuelEntries(options?: { limit?: number, startDate?: string, endDate?: string }): Promise<FuelEntry[]> {
    const query = new URLSearchParams();
    query.append("limit", (options?.limit || 2000).toString());
    if (options?.startDate) query.append("startDate", options.startDate);
    if (options?.endDate) query.append("endDate", options.endDate);

    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries?${query.toString()}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch fuel entries");
    return response.json();
  },

  async saveFuelEntry(entry: FuelEntry): Promise<FuelEntry> {
    // Phase 2: Staged Reconciliation - Default to Pending for new or legacy logs
    if (!entry.reconciliationStatus) {
        entry.reconciliationStatus = 'Pending';
    }

    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(entry)
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.error('[FuelService] Save fuel entry failed:', response.status, errorBody);
      throw new Error(errorBody.error || `Failed to save fuel entry (${response.status})`);
    }
    const result = await response.json();
    // If the server gate-held the entry (no GPS + no manual station override),
    // return the original entry with gateHeld flag so the UI can handle it
    if (result.gateHeld) {
      return { ...entry, gateHeld: true, learntLocationId: result.learntLocationId } as FuelEntry;
    }
    return result.data || result;
  },

  async deleteFuelEntry(id: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete fuel entry");
  },

  // --- Mileage Adjustments ---
  async getMileageAdjustments(): Promise<MileageAdjustment[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/mileage-adjustments`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch mileage adjustments");
    return response.json();
  },

  async saveMileageAdjustment(adj: MileageAdjustment): Promise<MileageAdjustment> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/mileage-adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(adj)
    });
    if (!response.ok) throw new Error("Failed to save mileage adjustment");
    const result = await response.json();
    return result.data || result;
  },

  async deleteMileageAdjustment(id: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/mileage-adjustments/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete mileage adjustment");
  },

  // --- Fuel Scenarios ---
  async getFuelScenarios(): Promise<FuelScenario[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/scenarios`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch fuel scenarios");
    return response.json();
  },

  async saveFuelScenario(scenario: FuelScenario): Promise<FuelScenario> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/scenarios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(scenario)
    });
    if (!response.ok) throw new Error("Failed to save fuel scenario");
    const result = await response.json();
    return result.data || result;
  },

  async deleteFuelScenario(id: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/scenarios/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete fuel scenario");
  },

  // --- Phase 4: Finalization & Ledger ---
  async finalizeReconciliation(reports: any[]): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/reconciliation/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ reports })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to finalize reconciliation");
    }
  },

  // --- Synchronization Helpers (Phase 1) ---
  async getLinkedTransaction(transactionId: string): Promise<any | null> {
    if (!transactionId) return null;
    try {
      // We import api dynamically or use fetch to avoid circular dependency
      const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/../financial-operations/transactions/${transactionId}`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      if (!response.ok) return null;
      return response.json();
    } catch (e) {
      console.error("Error fetching linked transaction:", e);
      return null;
    }
  },

  // --- Gas Stations ---
  async getStations(): Promise<any[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch stations");
    return response.json();
  },

  async checkStationDuplicate(plusCode: string, lat: number, lng: number, excludeId?: string, category?: string): Promise<any> {
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

  async saveStation(station: any): Promise<any> {
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
    const result = await response.json();
    // Return full result when it includes cleanup metadata, otherwise just station data
    if (result.autoCleanedLearnt !== undefined) {
      return result;
    }
    return result.data || result;
  },

  async deleteStation(id: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete station");
  },

  // --- Demote Station & Cascade ---
  // Demotes a verified station to unverified, unlinks all fuel entries, and creates
  // a learnt location for re-matching via the admin's normal workflow.
  async demoteStation(stationId: string): Promise<{
    success: boolean;
    stationName: string;
    unlinkedEntries: number;
    learntLocationId: string | null;
    message: string;
  }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/demote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ stationId })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to demote station');
    }
    return response.json();
  },

  // --- One-Time Migration: Patch station statuses ---
  async migrateStationStatuses(): Promise<{ patchedCount: number; totalStations: number }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/stations/migrate-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      }
    });
    if (!response.ok) throw new Error("Failed to run station status migration");
    return response.json();
  },

  async getParentCompanies(): Promise<any[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/parent-companies`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch parent companies");
    return response.json();
  },

  async geocodeAddress(address: string): Promise<{ lat: number; lng: number; formattedAddress?: string; city?: string; parish?: string }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/geo/geocode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ address })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Geocoding failed");
    }
    return response.json();
  },

  async reverseGeocode(lat: number, lng: number): Promise<{ formattedAddress: string; streetAddress: string; city: string; parish: string; country: string; lat: number; lng: number }> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/geo/reverse-geocode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({ lat, lng })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Reverse geocoding failed");
    }
    return response.json();
  },

  async saveParentCompanies(companies: any[]): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/parent-companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(companies)
    });
    if (!response.ok) throw new Error("Failed to save parent companies");
  },

  /**
   * Generates a cleanup map for a fuel entry, identifying all linked ledger records
   * that must be removed to maintain system integrity.
   */
  async getCleanupMap(entryId: string): Promise<{ entry: FuelEntry | null, relatedTransactions: FinancialTransaction[] }> {
    try {
      const allEntries = await this.getFuelEntries();
      const entry = allEntries.find(e => e.id === entryId) || null;
      
      if (!entry) {
        return { entry: null, relatedTransactions: [] };
      }

      const relatedTransactions = await settlementService.getRelatedTransactions(entry);
      return { entry, relatedTransactions };
    } catch (error) {
      console.error("[FuelService] Failed to generate cleanup map:", error);
      return { entry: null, relatedTransactions: [] };
    }
  }
};