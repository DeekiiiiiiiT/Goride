import { publicAnonKey } from '../utils/supabase/info';
import { API_ENDPOINTS } from './apiConfig';
import type { EarningsPolicy } from '../types/earningsPolicy';

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

export const earningsPolicyService = {
  async getEarningsPolicies(): Promise<EarningsPolicy[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/earnings-policies`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch earnings policies");
    return response.json();
  },

  async saveEarningsPolicy(policy: EarningsPolicy): Promise<EarningsPolicy> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/earnings-policies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(policy)
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => null);
      throw new Error(errBody?.error || "Failed to save earnings policy");
    }
    const result = await response.json();
    return result.data || result;
  },

  async deleteEarningsPolicy(id: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/earnings-policies/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => null);
      throw new Error(errBody?.error || "Failed to delete earnings policy");
    }
  },
};
