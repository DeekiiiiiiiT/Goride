import { projectId, publicAnonKey } from '../utils/supabase/info';
import { fetchWithRetry } from './api';
import { API_ENDPOINTS } from './apiConfig';
import { EquipmentItem } from '../types/equipment';

export interface EquipmentTemplate {
    id: string;
    name: string;
    description?: string;
    items: EquipmentItem[];
    createdAt: string;
}

export const templateService = {
  async getTemplates(): Promise<EquipmentTemplate[]> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/templates`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch templates");
    return response.json();
  },

  async saveTemplate(template: EquipmentTemplate): Promise<EquipmentTemplate> {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(template)
    });
    if (!response.ok) throw new Error("Failed to save template");
    const result = await response.json();
    return result.data;
  }
};
