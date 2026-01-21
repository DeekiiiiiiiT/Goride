import { projectId, publicAnonKey } from '../utils/supabase/info';
import { FuelCard, FuelEntry, MileageAdjustment, FuelScenario } from '../types/fuel';
import { API_ENDPOINTS } from './apiConfig';

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
  async getFuelEntries(): Promise<FuelEntry[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch fuel entries");
    return response.json();
  },

  async saveFuelEntry(entry: FuelEntry): Promise<FuelEntry> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(entry)
    });
    if (!response.ok) throw new Error("Failed to save fuel entry");
    const result = await response.json();
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
  }
};
