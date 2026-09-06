
import { requireAuthHeaders } from '../utils/authHeaders';
import { API_ENDPOINTS } from './apiConfig';
import type { EarningsPolicy } from '../types/earningsPolicy';
import { normalizePolicyVersions } from '../utils/earningsPolicyVersion';

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

const POLICIES_TTL_MS = 60_000;
let policiesInflight: Promise<EarningsPolicy[]> | null = null;
let policiesCache: { at: number; data: EarningsPolicy[] } | null = null;

/** Drop cache after save/delete so desks see fresh policies. */
export function clearEarningsPoliciesCache() {
  policiesCache = null;
  policiesInflight = null;
}

export const earningsPolicyService = {
  async getEarningsPolicies(): Promise<EarningsPolicy[]> {
    if (policiesCache && Date.now() - policiesCache.at < POLICIES_TTL_MS) {
      return policiesCache.data;
    }
    if (policiesInflight) return policiesInflight;

    policiesInflight = (async () => {
      try {
        const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/earnings-policies`, {
          headers: await requireAuthHeaders(null),
        });
        if (!response.ok) throw new Error('Failed to fetch earnings policies');
        const items = await response.json();
        const data = (Array.isArray(items) ? items : []).map((p: EarningsPolicy) =>
          normalizePolicyVersions(p),
        );
        policiesCache = { at: Date.now(), data };
        return data;
      } finally {
        policiesInflight = null;
      }
    })();

    return policiesInflight;
  },

  async saveEarningsPolicy(policy: EarningsPolicy): Promise<EarningsPolicy> {
    // Persist assignment-normalized shape (no legacy driverIds as source of truth)
    const toSave = normalizePolicyVersions(policy);
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/earnings-policies`, {
      method: 'POST',
      headers: await requireAuthHeaders(),
      body: JSON.stringify(toSave)
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => null);
      throw new Error(errBody?.error || "Failed to save earnings policy");
    }
    const result = await response.json();
    const saved = result.data || result;
    clearEarningsPoliciesCache();
    return normalizePolicyVersions(saved);
  },

  async deleteEarningsPolicy(id: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/earnings-policies/${id}`, {
      method: 'DELETE',
      headers: await requireAuthHeaders(null)
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => null);
      throw new Error(errBody?.error || "Failed to delete earnings policy");
    }
    clearEarningsPoliciesCache();
  },
};
