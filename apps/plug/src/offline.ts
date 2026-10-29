const KEY = 'roam-plug-offline';
const STATIONS = 'roam-plug-stations';

export type CachedStation = {
  id: string;
  name: string;
  brand?: string | null;
  address?: string | null;
  lat?: number;
  lng?: number;
  pcode?: string | null;
  prices?: Record<string, unknown>;
};

export function writeStationCache(stations: CachedStation[]) {
  localStorage.setItem(STATIONS, JSON.stringify(stations));
}

export function readStationCache(): CachedStation[] {
  try {
    const rows = JSON.parse(localStorage.getItem(STATIONS) || '[]') as CachedStation[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export type OfflineJob = { id: string; path: string; body: unknown; at: string };

export function readQueue(): OfflineJob[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as OfflineJob[];
  } catch {
    return [];
  }
}

export function enqueue(path: string, body: unknown): OfflineJob {
  const job = { id: crypto.randomUUID(), path, body, at: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify([...readQueue(), job]));
  return job;
}

export function removeJob(id: string) {
  localStorage.setItem(KEY, JSON.stringify(readQueue().filter((job) => job.id !== id)));
}
