import { FuelDispute } from '../types/fuel';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { API_ENDPOINTS } from './apiConfig';

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
    try {
        const res = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${publicAnonKey}`,
                'Content-Type': 'application/json',
                ...options.headers,
            }
        });
        if (!res.ok && retries > 0 && res.status >= 500) {
            throw new Error(res.statusText);
        }
        return res;
    } catch (err) {
        if (retries > 0) {
            await new Promise(r => setTimeout(r, 500));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw err;
    }
}

export const FuelDisputeService = {
    async getAllDisputes(): Promise<FuelDispute[]> {
        const res = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-disputes`);
        if (!res.ok) throw new Error('Failed to fetch disputes');
        return res.json();
    },

    async createDispute(dispute: FuelDispute): Promise<void> {
        const res = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-disputes`, {
            method: 'POST',
            body: JSON.stringify(dispute),
        });
        if (!res.ok) throw new Error('Failed to create dispute');
    },

    async updateDispute(dispute: FuelDispute): Promise<void> {
         const res = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-disputes`, {
            method: 'POST', // UPSERT
            body: JSON.stringify(dispute),
        });
        if (!res.ok) throw new Error('Failed to update dispute');
    },

    async deleteDispute(id: string): Promise<void> {
        const res = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-disputes/${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete dispute');
    },
    
    // Helpers to filter client-side since we fetch all (KV filtering is limited)
    async getDisputesByWeek(weekStart: string): Promise<FuelDispute[]> {
        const disputes = await this.getAllDisputes();
        return disputes.filter(d => d.weekStart === weekStart);
    },
    
    async getDisputesByDriver(driverId: string): Promise<FuelDispute[]> {
        const disputes = await this.getAllDisputes();
        return disputes.filter(d => d.driverId === driverId);
    },

    async getDisputeByReportId(weekStart: string, vehicleId: string, weekEnd?: string): Promise<FuelDispute | undefined> {
        const disputes = await this.getAllDisputes();
        return disputes.find(d => 
            d.weekStart === weekStart && 
            d.vehicleId === vehicleId &&
            d.weekEnd === weekEnd
        );
    }
};
