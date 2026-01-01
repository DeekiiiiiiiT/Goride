import { projectId, publicAnonKey } from '../utils/supabase/info';
import { EquipmentItem } from '../types/equipment';
import { fetchWithRetry } from './api';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386`;

export const equipmentService = {
  async getEquipment(vehicleId: string): Promise<EquipmentItem[]> {
    const response = await fetchWithRetry(`${BASE_URL}/equipment/${vehicleId}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch equipment");
    return response.json();
  },

  async saveEquipment(item: EquipmentItem): Promise<EquipmentItem> {
    const response = await fetchWithRetry(`${BASE_URL}/equipment`, {
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
    const response = await fetchWithRetry(`${BASE_URL}/equipment/${vehicleId}/${itemId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete equipment");
  }
};
