import { API_ENDPOINTS } from './config';
import { supabaseAnonFunctionHeaders } from './supabaseInfo';

export type CatalogApp = 'fleet' | 'driver' | 'rush' | 'haul';

export async function catalogGet<T>(app: CatalogApp, path: string): Promise<T> {
  const response = await fetch(`${API_ENDPOINTS.catalog}${path}`, {
    headers: { ...supabaseAnonFunctionHeaders(), 'x-roam-app': app },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : 'Could not load that';
    throw new Error(message);
  }
  return body as T;
}

export async function catalogPages<T>(app: CatalogApp, path: string, key: string): Promise<T[]> {
  const all: T[] = [];
  const limit = 500;
  let offset = 0;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await catalogGet<Record<string, unknown>>(
      app,
      `${path}${sep}limit=${limit}&offset=${offset}`,
    );
    const rows = Array.isArray(page[key]) ? (page[key] as T[]) : [];
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

/** Opens the shared catalog so the Apps page records this product's last sync. */
export function syncCatalog(app: CatalogApp): void {
  void Promise.all([
    catalogGet(app, '/v1/stations?limit=1'),
    catalogGet(app, '/v1/places'),
    catalogGet(app, '/v1/tolls?limit=1'),
    catalogGet(app, '/v1/vehicle-catalog?limit=1'),
  ]).catch(() => {});
}
