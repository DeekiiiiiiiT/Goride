const STORAGE_KEY = 'freight-hub-facility';

export function readHubFacility(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function writeHubFacility(id: string): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

/** Prefer stored id if still in hub list; else first hub. */
export function resolveHubFacility(
  hubs: { id?: unknown }[],
  preferred?: string | null,
): string {
  const ids = hubs.map((h) => String(h.id));
  if (!ids.length) return '';
  const want = preferred || readHubFacility();
  if (want && ids.includes(want)) return want;
  return ids[0];
}
