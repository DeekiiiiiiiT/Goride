const KEY = 'roam-plug-offline';

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
