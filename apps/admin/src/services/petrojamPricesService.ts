import { projectId } from '../utils/supabase/info';
import { supabase } from '../utils/supabase/client';

const BASE = `https://${projectId}.supabase.co/functions/v1/petrojam-prices`;

export type PetrojamPrice = {
  id: string;
  priceDate: string;
  gasolene87: number | null;
  gasolene90: number | null;
  autoDiesel: number | null;
  kerosene: number | null;
  propane: number | null;
  butane: number | null;
  hfo: number | null;
  asphalt: number | null;
  ulsd: number | null;
  sourceUrl?: string;
  scrapedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PetrojamSyncMode = 'latest' | 'year' | 'month' | 'all';

export type PetrojamSyncResult = {
  ok: boolean;
  mode: PetrojamSyncMode;
  year?: number | null;
  month?: number | null;
  inserted: number;
  updated: number;
  latestDate: string | null;
  oldestDate?: string | null;
  pagesFetched?: number;
  rowCount: number;
  scrapedAt: string;
};

export type PetrojamListOptions = {
  limit?: number;
  year?: number | null;
  month?: number | null;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token || ''}`,
    'Content-Type': 'application/json',
  };
}

export const petrojamPricesService = {
  async listPrices(options: PetrojamListOptions = {}): Promise<PetrojamPrice[]> {
    const params = new URLSearchParams();
    params.set('limit', String(options.limit ?? 200));
    if (options.year) params.set('year', String(options.year));
    if (options.month) params.set('month', String(options.month));

    const res = await fetch(`${BASE}/admin/prices?${params.toString()}`, {
      headers: await authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Failed to load prices (${res.status})`);
    }
    const data = await res.json();
    return (data.prices || []) as PetrojamPrice[];
  },

  async sync(body: {
    mode: PetrojamSyncMode;
    year?: number;
    month?: number;
  }): Promise<PetrojamSyncResult> {
    const res = await fetch(`${BASE}/admin/sync`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Sync failed (${res.status})`);
    }
    return (await res.json()) as PetrojamSyncResult;
  },

  async syncLatest(): Promise<PetrojamSyncResult> {
    return this.sync({ mode: 'latest' });
  },
};
