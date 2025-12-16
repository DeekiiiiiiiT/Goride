import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Trip, Notification } from '../types/data';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386`;

export const api = {
  async saveTrips(trips: Trip[]) {
    const response = await fetch(`${BASE_URL}/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(trips),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save trips: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getTrips(): Promise<Trip[]> {
    const response = await fetch(`${BASE_URL}/trips`, {
        headers: {
            'Authorization': `Bearer ${publicAnonKey}`
        }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch trips: ${response.statusText}`);
    }
    
    return response.json();
  },

  async getNotifications(): Promise<Notification[]> {
    const response = await fetch(`${BASE_URL}/notifications`, {
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch notifications`);
    }

    return response.json();
  },

  async markNotificationAsRead(id: string) {
    const response = await fetch(`${BASE_URL}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to mark notification as read`);
    }

    return response.json();
  },

  async createNotification(notification: Partial<Notification>) {
    const response = await fetch(`${BASE_URL}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(notification)
    });

    if (!response.ok) {
      throw new Error(`Failed to create notification`);
    }

    return response.json();
  },

  async getAlertRules() {
    const response = await fetch(`${BASE_URL}/alert-rules`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to fetch alert rules");
    return response.json();
  },

  async saveAlertRule(rule: any) {
    const response = await fetch(`${BASE_URL}/alert-rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(rule)
    });
    if (!response.ok) throw new Error("Failed to save alert rule");
    return response.json();
  },

  async deleteAlertRule(id: string) {
     const response = await fetch(`${BASE_URL}/alert-rules/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    if (!response.ok) throw new Error("Failed to delete alert rule");
    return response.json();
  }
};
