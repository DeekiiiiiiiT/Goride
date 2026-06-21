import { useCallback, useEffect, useState } from 'react';

const LEGACY_KEY = 'roam-dash-favorites';
const RESTAURANTS_KEY = 'roam-dash-favorite-restaurants';
const ITEMS_KEY = 'roam-dash-favorite-items';

export type FavoriteItemKey = `${string}:${string}`;

type FavoritesListener = () => void;

const listeners = new Set<FavoritesListener>();

function notifyListeners(): void {
  listeners.forEach((cb) => cb());
}

function migrateLegacyRestaurants(): string[] {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return [];
    const parsed = JSON.parse(legacy) as string[];
    localStorage.setItem(RESTAURANTS_KEY, JSON.stringify(parsed));
    localStorage.removeItem(LEGACY_KEY);
    return parsed;
  } catch {
    return [];
  }
}

export function getFavoriteRestaurants(): string[] {
  try {
    const raw = localStorage.getItem(RESTAURANTS_KEY);
    if (raw) return JSON.parse(raw) as string[];
    return migrateLegacyRestaurants();
  } catch {
    return [];
  }
}

export function getFavoriteItems(): FavoriteItemKey[] {
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    return raw ? (JSON.parse(raw) as FavoriteItemKey[]) : [];
  } catch {
    return [];
  }
}

/** @deprecated Use getFavoriteRestaurants */
export function getFavorites(): string[] {
  return getFavoriteRestaurants();
}

export function isFavorite(merchantId: string): boolean {
  return getFavoriteRestaurants().includes(merchantId);
}

export function isFavoriteItem(merchantId: string, itemId: string): boolean {
  return getFavoriteItems().includes(`${merchantId}:${itemId}`);
}

export function toggleFavorite(merchantId: string): boolean {
  const current = getFavoriteRestaurants();
  const exists = current.includes(merchantId);
  const next = exists ? current.filter((id) => id !== merchantId) : [...current, merchantId];
  localStorage.setItem(RESTAURANTS_KEY, JSON.stringify(next));
  notifyListeners();
  return !exists;
}

export function toggleFavoriteItem(merchantId: string, itemId: string): boolean {
  const key = `${merchantId}:${itemId}` as FavoriteItemKey;
  const current = getFavoriteItems();
  const exists = current.includes(key);
  const next = exists ? current.filter((k) => k !== key) : [...current, key];
  localStorage.setItem(ITEMS_KEY, JSON.stringify(next));
  notifyListeners();
  return !exists;
}

export function subscribeFavorites(listener: FavoritesListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFavorites() {
  const [restaurantIds, setRestaurantIds] = useState(getFavoriteRestaurants);
  const [itemKeys, setItemKeys] = useState(getFavoriteItems);

  const refresh = useCallback(() => {
    setRestaurantIds(getFavoriteRestaurants());
    setItemKeys(getFavoriteItems());
  }, []);

  useEffect(() => subscribeFavorites(refresh), [refresh]);

  return { restaurantIds, itemKeys, refresh };
}
