import { requireAuthHeaders } from '../utils/authHeaders';
import { InventoryItem } from '../types/fleet';
import { fetchWithRetry } from './api';
import { API_ENDPOINTS } from './apiConfig';

export const inventoryService = {
  async getInventory(): Promise<InventoryItem[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/inventory`, {
      headers: await requireAuthHeaders(null)
    });
    if (!response.ok) throw new Error("Failed to fetch inventory");
    return response.json();
  },

  async saveStock(item: InventoryItem): Promise<InventoryItem> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/inventory`, {
      method: 'POST',
      headers: await requireAuthHeaders(),
      body: JSON.stringify(item)
    });
    if (!response.ok) throw new Error("Failed to save inventory item");
    const result = await response.json();
    return result.data;
  },

  async bulkUpdateStock(items: InventoryItem[]): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/inventory/bulk`, {
      method: 'POST',
      headers: await requireAuthHeaders(),
      body: JSON.stringify(items)
    });
    if (!response.ok) throw new Error("Failed to bulk update stock");
  },

  async deleteStock(itemId: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/inventory/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      headers: await requireAuthHeaders(null),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || "Failed to delete inventory item");
    }
  }
};
