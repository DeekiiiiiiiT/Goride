import { projectId, publicAnonKey } from '../utils/supabase/info';
import { EquipmentItem } from '../types/equipment';
import { fetchWithRetry } from './api';
import { API_ENDPOINTS } from './apiConfig';

export const equipmentService = {
  async getEquipment(vehicleId: string): Promise<EquipmentItem[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/equipment/${vehicleId}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch equipment");
    return response.json();
  },

  async saveEquipment(item: EquipmentItem): Promise<EquipmentItem> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/equipment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(item)
    });
    if (!response.ok) throw new Error("Failed to save equipment");
    const result = await response.json();
    return result.data; 
  },

  async deleteEquipment(vehicleId: string, itemId: string): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/equipment/${vehicleId}/${itemId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete equipment");
  },

  async getAllEquipment(): Promise<EquipmentItem[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/fleet/equipment/all`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch all equipment");
    return response.json();
  },

  async bulkAssignEquipment(items: EquipmentItem[]): Promise<void> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/fleet/equipment/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(items)
    });
    if (!response.ok) throw new Error("Failed to bulk assign equipment");
  }
};
