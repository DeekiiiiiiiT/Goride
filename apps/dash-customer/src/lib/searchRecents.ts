const STORAGE_KEY = 'roam-dash-recent-searches';
const MAX_RECENTS = 8;

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function writeRecents(items: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)));
  } catch {
    // ignore quota
  }
}

export function getRecentSearches(): string[] {
  return readRecents();
}

export function pushRecentSearch(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return readRecents();
  const next = [trimmed, ...readRecents().filter((item) => item.toLowerCase() !== trimmed.toLowerCase())];
  writeRecents(next);
  return readRecents();
}

export function removeRecentSearch(query: string): string[] {
  const needle = query.trim().toLowerCase();
  writeRecents(readRecents().filter((item) => item.toLowerCase() !== needle));
  return readRecents();
}

export function clearRecentSearches(): string[] {
  writeRecents([]);
  return [];
}
