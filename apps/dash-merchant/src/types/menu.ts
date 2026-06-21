export interface ModifierOption {
  id: string;
  name: string;
  priceAdjustment: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  is_available: boolean;
  is_featured: boolean;
  prep_time_mins: number | null;
  calories: number | null;
  options: ModifierGroup[];
  sort_order?: number;
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
  const selection =
    group.maxSelections === 1 ? 'Choose 1' : 'Multi-select';
  return `${group.required ? 'Required' : 'Optional'} • ${selection}`;
}
