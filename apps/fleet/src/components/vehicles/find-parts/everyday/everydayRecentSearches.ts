export type RecentMmy = { make: string; model: string; year: number };

const KEY = "fleet-find-parts-recent-mmy";

export function loadRecentSearches(): RecentMmy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentMmy[];
    return Array.isArray(parsed) ? parsed.filter((r) => r.make && r.model && r.year) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(entry: RecentMmy) {
  if (typeof window === "undefined") return;
  const next = [entry, ...loadRecentSearches().filter((r) => !(r.make === entry.make && r.model === entry.model && r.year === entry.year))].slice(0, 8);
  localStorage.setItem(KEY, JSON.stringify(next));
}
