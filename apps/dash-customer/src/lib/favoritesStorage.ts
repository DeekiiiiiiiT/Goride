const STORAGE_KEY = 'roam-dash-favorites';

export function getFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function isFavorite(merchantId: string): boolean {
  return getFavorites().includes(merchantId);
}

export function toggleFavorite(merchantId: string): boolean {
  const current = getFavorites();
  const exists = current.includes(merchantId);
  const next = exists ? current.filter((id) => id !== merchantId) : [...current, merchantId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return !exists;
}
