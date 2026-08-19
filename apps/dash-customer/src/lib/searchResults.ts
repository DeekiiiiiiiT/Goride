import type { FilterState } from '@/components/search/FilterSortSheet';

export type SearchableRestaurant = {
  id: string;
  name: string;
  cuisines: string;
  rating: number;
  eta: string;
  image: string;
  tags?: string[];
  vertical_type?: string;
  delivery?: string;
  priceLevel?: string;
  lat?: number;
  lng?: number;
};

export const EMPTY_SEARCH_FILTERS: FilterState = {
  sort: 'recommended',
  prices: [],
  rating: '',
  dietary: [],
  deliveryFee: '',
};

export function etaMinutes(eta: string): number {
  const n = parseInt(eta, 10);
  return Number.isFinite(n) ? n : 999;
}

export function deliveryFeeAmount(label?: string): number {
  if (!label) return 9999;
  if (/free/i.test(label)) return 0;
  const n = parseInt(label.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 9999;
}

export function priceLevelFromCosts(minOrder: number, deliveryFee: number): '$' | '$$' | '$$$' {
  const score = Math.max(0, minOrder) + Math.max(0, deliveryFee);
  if (score <= 150) return '$';
  if (score <= 400) return '$$';
  return '$$$';
}

export function dishPriceLevel(price: number): '$' | '$$' | '$$$' {
  if (price < 1000) return '$';
  if (price < 2000) return '$$';
  return '$$$';
}

const DIETARY_KEYWORDS: Record<string, string[]> = {
  vegetarian: ['vegetarian', 'veggie'],
  vegan: ['vegan', 'plant-based', 'plant based'],
  gluten_free: ['gluten-free', 'gluten free'],
  halal: ['halal'],
};

function dietaryHaystack(row: { name: string; cuisines?: string; tags?: string[]; description?: string }): string {
  return `${row.name} ${row.cuisines ?? ''} ${row.description ?? ''} ${(row.tags ?? []).join(' ')}`.toLowerCase();
}

function matchesDietary(haystack: string, dietary: string[]): boolean {
  if (dietary.length === 0) return true;
  return dietary.every((flag) => (DIETARY_KEYWORDS[flag] ?? []).some((keyword) => haystack.includes(keyword)));
}

function matchesPriceLevel(level: string | undefined, selected: string[]): boolean {
  if (selected.length === 0) return true;
  return Boolean(level && selected.includes(level));
}

function relevanceScore(row: SearchableRestaurant, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return row.rating;
  const name = row.name.toLowerCase();
  const cuisine = row.cuisines.toLowerCase();
  if (name === q) return 300 + row.rating;
  if (name.startsWith(q)) return 200 + row.rating;
  if (name.includes(q)) return 100 + row.rating;
  if (cuisine.includes(q)) return 50 + row.rating;
  return row.rating;
}

export function applyRestaurantFilters(
  results: SearchableRestaurant[],
  filters: FilterState,
  query: string,
  origin?: { lat?: number; lng?: number },
): SearchableRestaurant[] {
  let list = results.filter(
    (r) =>
      !query.trim() ||
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      r.cuisines.toLowerCase().includes(query.toLowerCase()),
  );

  if (filters.prices.length) {
    list = list.filter((r) =>
      matchesPriceLevel(r.priceLevel ?? priceLevelFromCosts(0, deliveryFeeAmount(r.delivery)), filters.prices),
    );
  }

  if (filters.dietary.length) {
    list = list.filter((r) => matchesDietary(dietaryHaystack(r), filters.dietary));
  }

  if (filters.rating) {
    const min = parseFloat(filters.rating);
    if (Number.isFinite(min)) list = list.filter((r) => r.rating >= min);
  }

  if (filters.deliveryFee === 'free') {
    list = list.filter((r) => deliveryFeeAmount(r.delivery) === 0);
  } else if (filters.deliveryFee === 'under_100') {
    list = list.filter((r) => deliveryFeeAmount(r.delivery) < 100);
  } else if (filters.deliveryFee === 'under_200') {
    list = list.filter((r) => deliveryFeeAmount(r.delivery) < 200);
  }

  const sorted = [...list];
  if (filters.sort === 'rating') {
    sorted.sort((a, b) => b.rating - a.rating);
  } else if (filters.sort === 'fastest') {
    sorted.sort((a, b) => etaMinutes(a.eta) - etaMinutes(b.eta));
  } else if (filters.sort === 'price_asc') {
    sorted.sort((a, b) => deliveryFeeAmount(a.delivery) - deliveryFeeAmount(b.delivery));
  } else if (filters.sort === 'price_desc') {
    sorted.sort((a, b) => deliveryFeeAmount(b.delivery) - deliveryFeeAmount(a.delivery));
  } else if (filters.sort === 'distance' && origin?.lat != null && origin?.lng != null) {
    sorted.sort(
      (a, b) =>
        distanceKm(origin.lat!, origin.lng!, a.lat, a.lng) -
        distanceKm(origin.lat!, origin.lng!, b.lat, b.lng),
    );
  } else {
    sorted.sort((a, b) => relevanceScore(b, query) - relevanceScore(a, query));
  }

  return sorted;
}

export function applyDishFilters<T extends { name: string; description?: string; price: number }>(
  results: T[],
  filters: FilterState,
): T[] {
  let list = results;
  if (filters.prices.length) {
    list = list.filter((row) => matchesPriceLevel(dishPriceLevel(row.price), filters.prices));
  }
  if (filters.dietary.length) {
    list = list.filter((row) => matchesDietary(dietaryHaystack({ name: row.name, description: row.description }), filters.dietary));
  }
  return list;
}

function distanceKm(lat1: number, lng1: number, lat2?: number, lng2?: number): number {
  if (lat2 == null || lng2 == null || !Number.isFinite(lat2) || !Number.isFinite(lng2)) return 9999;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
