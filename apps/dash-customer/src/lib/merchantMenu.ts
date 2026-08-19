import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { allowMocks } from './mocksGate';
import {
  getRestaurantProfile,
  type MenuItem,
  type MenuModifierGroup,
  type RestaurantProfile,
} from './restaurantContent';

type ApiModifierOption = {
  id?: string;
  name?: string;
  label?: string;
  price?: number;
  priceAdjustment?: number;
};

type ApiModifierGroup = {
  id?: string;
  name?: string;
  title?: string;
  required?: boolean;
  maxSelections?: number;
  type?: string;
  options?: ApiModifierOption[];
};

function mapModifiers(raw: unknown): MenuModifierGroup[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ApiModifierGroup[]).map((group, gi) => {
    const max = Number(group.maxSelections ?? 1);
    const type =
      group.type === 'chips' || group.type === 'checkbox' || group.type === 'radio'
        ? group.type
        : max <= 1
          ? 'radio'
          : 'checkbox';
    return {
      id: String(group.id ?? `group-${gi}`),
      title: String(group.title ?? group.name ?? 'Options'),
      required: Boolean(group.required),
      type,
      options: (group.options ?? []).map((opt, oi) => ({
        id: String(opt.id ?? `opt-${gi}-${oi}`),
        label: String(opt.label ?? opt.name ?? 'Option'),
        price: Number(opt.priceAdjustment ?? opt.price ?? 0),
      })),
    };
  });
}

function mapMenuItem(row: Record<string, unknown>): MenuItem {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? 'Item'),
    description: String(row.description ?? ''),
    price: Number(row.price ?? 0),
    image: String(row.image_url ?? row.image ?? ''),
    categoryId: String(row.category_id ?? 'uncategorized'),
    featured: Boolean(row.is_featured),
    modifiers: mapModifiers(row.options),
  };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatHourLabel(time: string | null | undefined): string {
  if (!time) return '';
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hours)) return String(time);
  const date = new Date();
  date.setHours(hours, minutes || 0, 0, 0);
  return date.toLocaleTimeString('en-JM', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function mapMerchantHours(rows: unknown): { day: string; open: string; close: string }[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return [...rows]
    .map((raw) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}))
    .sort(
      (a, b) =>
        Number(a.day_of_week ?? a.dayOfWeek ?? 0) - Number(b.day_of_week ?? b.dayOfWeek ?? 0),
    )
    .map((row) => {
      const dow = Number(row.day_of_week ?? row.dayOfWeek ?? 0);
      const day = DAY_NAMES[dow] ?? `Day ${dow}`;
      if (Boolean(row.is_closed ?? row.isClosed)) {
        return { day, open: 'Closed', close: 'Closed' };
      }
      return {
        day,
        open: formatHourLabel(String(row.open_time ?? row.openTime ?? '')) || '—',
        close: formatHourLabel(String(row.close_time ?? row.closeTime ?? '')) || '—',
      };
    });
}

export function mapMerchantMenuResponse(data: {
  merchant?: Record<string, unknown>;
  categories?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  hours?: unknown;
}): RestaurantProfile {
  const merchant = data.merchant ?? {};
  const prep = Number(merchant.avg_prep_time_mins ?? 25);
  const fee = Number(merchant.delivery_fee ?? 0);
  const categories = (data.categories ?? []).map((cat) => ({
    id: String(cat.id ?? ''),
    label: String(cat.name ?? 'Menu'),
  }));

  const items = (data.items ?? []).map(mapMenuItem);

  // Ensure every item category appears in the chip row
  const catIds = new Set(categories.map((c) => c.id));
  for (const item of items) {
    if (item.categoryId && !catIds.has(item.categoryId)) {
      categories.push({ id: item.categoryId, label: 'More' });
      catIds.add(item.categoryId);
    }
  }

  if (categories.length === 0 && items.length > 0) {
    categories.push({ id: 'uncategorized', label: 'Menu' });
  }

  return {
    id: String(merchant.id ?? ''),
    name: String(merchant.name ?? 'Store'),
    cuisines: String(merchant.cuisine_type ?? merchant.description ?? ''),
    rating: Number(merchant.rating ?? 0),
    ratingCount: Number(merchant.rating_count ?? 0),
    eta: `${prep}-${prep + 15} min`,
    distance: '',
    deliveryFee: fee === 0 ? 'Free delivery' : `J$${fee.toLocaleString()} delivery fee`,
    promoTitle: '',
    promoCode: '',
    heroImage: String(merchant.cover_image_url ?? merchant.logo_url ?? ''),
    logoImage: String(merchant.logo_url ?? ''),
    hours: mapMerchantHours(data.hours ?? merchant.business_hours),
    address: String(merchant.address ?? ''),
    phone: String(merchant.phone ?? ''),
    categories,
    items,
  };
}

/** Fetch merchant + menu by UUID or slug. Falls back to static profile only when allowMocks(). */
export async function fetchMerchantMenu(id: string): Promise<RestaurantProfile> {
  try {
    const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${encodeURIComponent(id)}`, {
      headers: supabaseAnonFunctionHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch merchant menu');
    const data = (await res.json()) as {
      merchant?: Record<string, unknown>;
      categories?: Record<string, unknown>[];
      items?: Record<string, unknown>[];
      hours?: unknown;
    };
    if (!data.merchant) throw new Error('Merchant not found');
    return mapMerchantMenuResponse(data);
  } catch (err) {
    if (allowMocks()) return getRestaurantProfile(id);
    throw err;
  }
}
