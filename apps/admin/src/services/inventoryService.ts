import { publicAnonKey } from '../utils/supabase/info';
import { supabase } from '../utils/supabase/client';
import { InventoryItem } from '../types/fleet';
import { fetchWithRetry } from './api';
import { API_ENDPOINTS } from './apiConfig';

async function authHeaders(contentType: string | null = 'application/json'): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || publicAnonKey;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

export const inventoryService = {
  async getInventory(): Promise<InventoryItem[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/inventory`, {
      headers: await authHeaders(null)
    });
    if (!response.ok) throw new Error("Failed to fetch inventory");
    return response.json();
  },

  async saveStock(item: InventoryItem): Promise<InventoryItem> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/inventory`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(item)
    });
    if (!response.ok) throw new Error("Failed to save inventory item");
    const result = await response.json();
    return result.data;
  },

  async bulkUpdateStock(items: InventoryItem[]): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/inventory/bulk`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(items)
    });
    if (!response.ok) throw new Error("Failed to bulk update stock");
  },

  async deleteStock(itemId: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/inventory/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      headers: await authHeaders(null),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || "Failed to delete inventory item");
    }
  }
};
