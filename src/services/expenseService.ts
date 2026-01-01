import { projectId, publicAnonKey } from '../utils/supabase/info';
import { FixedExpenseConfig } from '../types/expenses';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386`;

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, backoff = 500): Promise<Response> {
  try {
    const response = await fetch(url, options);
    // Retry on server errors
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

export const expenseService = {
  /**
   * Fetch all fixed expenses for a specific vehicle.
   */
  async getFixedExpenses(vehicleId: string): Promise<FixedExpenseConfig[]> {
    const response = await fetchWithRetry(`${BASE_URL}/fixed-expenses/${vehicleId}`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch expenses: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Save (create or update) a fixed expense configuration.
   */
  async saveFixedExpense(expense: FixedExpenseConfig): Promise<FixedExpenseConfig> {
    const response = await fetchWithRetry(`${BASE_URL}/fixed-expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify(expense)
    });

    if (!response.ok) {
        throw new Error(`Failed to save expense: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data || result;
  },

  /**
   * Delete a fixed expense configuration.
   */
  async deleteFixedExpense(vehicleId: string, expenseId: string): Promise<void> {
    const response = await fetchWithRetry(`${BASE_URL}/fixed-expenses/${vehicleId}/${expenseId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${publicAnonKey}` }
    });

    if (!response.ok) {
        throw new Error(`Failed to delete expense: ${response.statusText}`);
    }
  }
};
