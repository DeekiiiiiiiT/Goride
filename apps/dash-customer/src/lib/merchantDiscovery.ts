import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import type { VerticalType } from '@roam/types';
import {
  FEATURED_RESTAURANTS,
  POPULAR_RESTAURANTS,
  RECOMMENDED_RESTAURANTS,
  type DiscoverRestaurant,
} from './discoverContent';

export type DiscoverMerchant = DiscoverRestaurant & {
  vertical_type: VerticalType;
  tagline?: string;
};

const ISLAND_GRILL_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuACVmjm9o43ryjD8KmiR54cjkSMcmur77NeumaxClQOl-tdmnq55CplyWT9OpWgpDUc0fOl4M5PFPJxrA2mumD6pB3thXUCNY8a67sXSt5VEBu9cmh6JB1L8KkD3LW7-dL6oH4uNC28jVbhpV_S_BVIP5zF_bPhNgOpZA3ShfepRuquataDbpoLqgNbdMUB0WEkbWtfw9_OgAbISNVHpmVRjc292ALZ6VtbKAItQBo0bbPpPLizf0kBl6P-wU4zH4yH9VeHDFGvh-c';

const FRESH_MART_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAwAdT30caXGHPkM-qknXWD6lrFON2r4RtsIN2FJyDHUyK8f3SBeSXp44nRG-wF7ydeu-ykCvCFxQ5p7BrL0pcLl7bcteYfFKDBSJXJADWxpAX5OuKjvpGuY7UcW9bgbmAj5i68e4oCAWYg7dJhf04V4imgjkizDLKyP-eGW4po7U05a7BQkb_zR2U3Nn0JwtWQLVvu9MqdlKFn6W_7NrrNBsdCCS5_6DWsgvOBV31Mtuq78coI1ZWlOX6PCXYIWmQBp5zKjXlPZL8';

const MOCK_GROCERY: DiscoverMerchant[] = [
  {
    id: 'fresh-mart',
    name: 'Fresh Mart',
    cuisines: "Kingston's Finest Produce",
    tagline: "Kingston's Finest Produce",
    rating: 4.6,
    eta: '35-50 min',
    delivery: 'Free',
    image: FRESH_MART_IMAGE,
    emoji: '🛒',
    vertical_type: 'grocery',
  },
];

export const HOME_VERTICAL_TABS: {
  id: VerticalType;
  label: string;
  icon: string;
  filled?: boolean;
}[] = [
  { id: 'restaurant', label: 'Food', icon: 'restaurant', filled: true },
  { id: 'grocery', label: 'Grocery', icon: 'shopping_basket' },
  { id: 'convenience', label: 'Convenience', icon: 'local_convenience_store' },
  { id: 'pharmacy', label: 'Pharmacy', icon: 'medical_services' },
  { id: 'alcohol', label: 'Alcohol', icon: 'liquor' },
];

function mapApiMerchant(row: Record<string, unknown>): DiscoverMerchant {
  const prep = Number(row.avg_prep_time_mins ?? 25);
  const fee = Number(row.delivery_fee ?? 0);
  return {
    id: String(row.slug ?? row.id ?? ''),
    name: String(row.name ?? 'Store'),
    cuisines: String(row.cuisine_type ?? row.description ?? ''),
    rating: Number(row.rating ?? 4.5),
    eta: `${prep}-${prep + 15} min`,
    delivery: fee === 0 ? 'Free' : `$${fee.toFixed(0)}`,
    image: String(row.cover_image_url ?? row.logo_url ?? ''),
    vertical_type: (row.vertical_type as VerticalType) ?? 'restaurant',
  };
}

function mockMerchants(vertical?: VerticalType): DiscoverMerchant[] {
  const restaurantMocks: DiscoverMerchant[] = [
    ...POPULAR_RESTAURANTS,
    ...FEATURED_RESTAURANTS,
    ...RECOMMENDED_RESTAURANTS,
  ].map((r) => ({
    ...r,
    vertical_type: 'restaurant' as VerticalType,
    tagline: r.cuisines,
    image:
      r.id === 'island-grill'
        ? ISLAND_GRILL_IMAGE
        : r.image,
  }));

  const deduped = Array.from(new Map(restaurantMocks.map((m) => [m.id, m])).values());

  if (!vertical || vertical === 'restaurant') {
    return [...deduped, ...MOCK_GROCERY];
  }
  if (vertical === 'grocery') return MOCK_GROCERY;
  return deduped.filter((m) => m.vertical_type === vertical);
}

export async function fetchDiscoverMerchants(vertical?: VerticalType): Promise<DiscoverMerchant[]> {
  try {
    const qs = vertical ? `?vertical=${encodeURIComponent(vertical)}` : '';
    const res = await fetch(`${API_ENDPOINTS.delivery}/merchants${qs}`, {
      headers: { apikey: publicAnonKey },
    });
    if (!res.ok) throw new Error('fetch failed');
    const data = (await res.json()) as { merchants?: Record<string, unknown>[] };
    const rows = data.merchants ?? [];
    if (!rows.length) throw new Error('empty');
    return rows.map(mapApiMerchant);
  } catch {
    return mockMerchants(vertical);
  }
}

export const VERTICAL_TABS = HOME_VERTICAL_TABS.filter((t) =>
  ['restaurant', 'grocery', 'convenience'].includes(t.id),
);

export function verticalLabel(vertical: VerticalType): string {
  const tab = HOME_VERTICAL_TABS.find((t) => t.id === vertical);
  return tab?.label ?? vertical;
}
