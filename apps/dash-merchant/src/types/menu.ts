export interface ModifierOption {
  id: string;
  name: string;
  priceAdjustment: number;
  isAvailable?: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
  kind?: 'included' | 'priced' | 'extra';
  libraryGroupId?: string;
  saveForLibrary?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  /** Alias of marketplace / customer-facing price during transition. */
  price: number;
  /** Merchant kitchen / in-store price (what they enter). */
  in_store_price?: number | null;
  /** What customers see on Roam Rush (may include merchant menu inflation). */
  marketplace_price?: number | null;
  image_url: string;
  category_id: string;
  is_available: boolean;
  is_featured: boolean;
  prep_time_mins: number | null;
  calories: number | null;
  options: ModifierGroup[];
  sort_order?: number;
  prep_station_id?: string | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  description?: string;
  sort_order: number;
}

export type MenuView = 'overview' | 'management' | 'category' | 'edit-item';

export function generateMenuId() {
  return Math.random().toString(36).substring(2, 9);
}

export function createEmptyMenuItem(categoryId = ''): MenuItem {
  return {
    id: '',
    name: '',
    description: '',
    price: 0,
    in_store_price: 0,
    marketplace_price: null,
    image_url: '',
    category_id: categoryId,
    is_available: true,
    is_featured: false,
    prep_time_mins: null,
    calories: null,
    options: [],
  };
}

export function getModifierGroupLabel(group: ModifierGroup) {
  if (group.kind === 'priced') return 'Required price · customer picks one';
  if (group.kind === 'included' || (group.required && group.maxSelections <= 1 && !group.options.some((option) => option.priceAdjustment > 0))) return 'Included · customer picks one';
  if (group.maxSelections > 1 && group.maxSelections < 99) return `Extras · up to ${group.maxSelections}`;
  return 'Extras · customer can add any';
}
