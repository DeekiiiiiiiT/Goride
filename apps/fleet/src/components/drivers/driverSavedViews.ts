/**
 * Saved Drivers list segments (Phase 6).
 * Persisted in localStorage until server-backed saved views land.
 */
export type DriverSavedView = {
  id: string;
  name: string;
  filters: {
    status?: string;
    minOwes?: number;
    atRiskOnly?: boolean;
  };
};

const KEY = 'fleet.drivers.savedViews';

export function loadDriverSavedViews(): DriverSavedView[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDriverSavedView(view: DriverSavedView): DriverSavedView[] {
  const next = [...loadDriverSavedViews().filter((v) => v.id !== view.id), view];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function deleteDriverSavedView(id: string): DriverSavedView[] {
  const next = loadDriverSavedViews().filter((v) => v.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
