/**
 * Saved Drivers list segments (Phase E).
 * Prefer org server store; fall back to localStorage when offline / unauthorized.
 */
import { API_ENDPOINTS } from '../../services/apiConfig';
import { requireAuthHeaders } from '../../utils/authHeaders';

export type DriverSavedView = {
  id: string;
  name: string;
  filters: {
    status?: string;
    minOwes?: number;
    atRiskOnly?: boolean;
    overdueFollowUpsOnly?: boolean;
  };
};

const KEY = 'fleet.drivers.savedViews';

function readLocal(): DriverSavedView[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(views: DriverSavedView[]): DriverSavedView[] {
  localStorage.setItem(KEY, JSON.stringify(views));
  return views;
}

/** Sync snapshot for first paint — local only. Prefer fetchDriverSavedViews for truth. */
export function loadDriverSavedViews(): DriverSavedView[] {
  if (typeof window === 'undefined') return [];
  return readLocal();
}

async function putServerViews(views: DriverSavedView[]): Promise<DriverSavedView[] | null> {
  try {
    const response = await fetch(`${API_ENDPOINTS.fleet}/drivers/saved-views`, {
      method: 'PUT',
      headers: await requireAuthHeaders(),
      body: JSON.stringify({ views }),
    });
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    const next = Array.isArray(json?.views) ? (json.views as DriverSavedView[]) : views;
    writeLocal(next);
    return next;
  } catch {
    return null;
  }
}

/** Load from API first; on failure use localStorage. */
export async function fetchDriverSavedViews(): Promise<DriverSavedView[]> {
  try {
    const response = await fetch(`${API_ENDPOINTS.fleet}/drivers/saved-views`, {
      headers: await requireAuthHeaders(null),
    });
    if (response.ok) {
      const json = await response.json().catch(() => ({}));
      const views = Array.isArray(json?.views) ? (json.views as DriverSavedView[]) : [];
      writeLocal(views);
      return views;
    }
  } catch {
    /* fall through */
  }
  return readLocal();
}

export async function saveDriverSavedView(view: DriverSavedView): Promise<DriverSavedView[]> {
  const next = [...readLocal().filter((v) => v.id !== view.id), view];
  const fromServer = await putServerViews(next);
  if (fromServer) return fromServer;
  return writeLocal(next);
}

export async function deleteDriverSavedView(id: string): Promise<DriverSavedView[]> {
  const next = readLocal().filter((v) => v.id !== id);
  const fromServer = await putServerViews(next);
  if (fromServer) return fromServer;
  return writeLocal(next);
}
