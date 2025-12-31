import { projectId, publicAnonKey } from '../utils/supabase/info';
import { FuelCard, FuelEntry, MileageAdjustment } from '../types/fuel';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386`;

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
    const response = await fetchWithRetry(`${BASE_URL}/fuel-cards`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch fuel cards");
    return response.json();
  },

  async saveFuelCard(card: FuelCard): Promise<FuelCard> {
    const response = await fetchWithRetry(`${BASE_URL}/fuel-cards`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/fuel-cards/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete fuel card");
  },

  // --- Fuel Entries ---
  async getFuelEntries(): Promise<FuelEntry[]> {
    const response = await fetchWithRetry(`${BASE_URL}/fuel-entries`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch fuel entries");
    return response.json();
  },

  async saveFuelEntry(entry: FuelEntry): Promise<FuelEntry> {
    const response = await fetchWithRetry(`${BASE_URL}/fuel-entries`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/fuel-entries/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete fuel entry");
  },

  // --- Mileage Adjustments ---
  async getMileageAdjustments(): Promise<MileageAdjustment[]> {
    const response = await fetchWithRetry(`${BASE_URL}/mileage-adjustments`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch mileage adjustments");
    return response.json();
  },

  async saveMileageAdjustment(adj: MileageAdjustment): Promise<MileageAdjustment> {
    const response = await fetchWithRetry(`${BASE_URL}/mileage-adjustments`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/mileage-adjustments/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete mileage adjustment");
  }
};
