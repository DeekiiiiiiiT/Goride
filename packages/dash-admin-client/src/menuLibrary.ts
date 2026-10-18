import type { MenuKitPayload, MenuProduct, OptionGroup, OptionPriceCell, ProductType } from '@roam/menu-engine';
import { dashAdminFetch } from './fetch';

export type LibraryCuisine = {
  id: string;
  label: string;
  aliases: string[];
  sort: number;
  iconUrl: string | null;
  archivedAt: string | null;
  usage?: {
    restaurants: number;
    kits: number;
    templates: number;
    restaurantList?: Array<{ id: string; name: string; primary: boolean }>;
  };
};

export type LibraryKitPayload = {
  sections: Array<{
    name: string;
    sectionType: string;
    products?: Array<{ name: string; type: string; templateId?: string }>;
  }>;
  sharedGroups?: MenuKitPayload['sharedGroups'];
};

export type LibraryKit = {
  id: string;
  name: string;
  cuisineIds: string[];
  payload: LibraryKitPayload;
  sort: number;
  archivedAt: string | null;
  updatedAt: string | null;
};

export type DishTemplatePayload = {
  product: MenuProduct;
  groups: OptionGroup[];
  priceMatrix: OptionPriceCell[];
};

export type DishTemplate = {
  id: string;
  name: string;
  description: string | null;
  productType: ProductType;
  cuisineIds: string[];
  payload: DishTemplatePayload;
  sort?: number;
  archivedAt?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export function getMenuLibrary(token: string) {
  return dashAdminFetch<{ cuisines: LibraryCuisine[]; kits: LibraryKit[]; templates: DishTemplate[] }>(token, '/menu-library');
}

export function createCuisine(token: string, label: string) {
  return dashAdminFetch<{ ok: boolean; id: string }>(token, '/menu-library/cuisines', {
    method: 'POST',
    body: JSON.stringify({ label }),
  });
}

export function updateCuisine(
  token: string,
  id: string,
  patch: { label?: string; sort?: number; iconUrl?: string | null; aliases?: string[]; archived?: boolean },
) {
  return dashAdminFetch<{ ok: boolean }>(token, `/menu-library/cuisines/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function mergeCuisine(token: string, id: string, intoId: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/menu-library/cuisines/${encodeURIComponent(id)}/merge`, {
    method: 'POST',
    body: JSON.stringify({ intoId }),
  });
}

export function deleteCuisine(token: string, id: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/menu-library/cuisines/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

type KitBody = { name: string; cuisineIds: string[]; sort?: number; payload: LibraryKitPayload };

export function saveKit(token: string, kit: KitBody, id?: string) {
  return dashAdminFetch<{ ok: boolean; id?: string }>(
    token,
    id ? `/menu-library/kits/${encodeURIComponent(id)}` : '/menu-library/kits',
    { method: id ? 'PUT' : 'POST', body: JSON.stringify(kit) },
  );
}

export function setKitArchived(token: string, id: string, archived: boolean) {
  return dashAdminFetch<{ ok: boolean }>(token, `/menu-library/kits/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived }),
  });
}

export function deleteKit(token: string, id: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/menu-library/kits/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

type TemplateBody = {
  name: string;
  description?: string | null;
  productType: ProductType;
  cuisineIds: string[];
  sort?: number;
  payload: DishTemplatePayload;
};

export function saveDishTemplate(token: string, template: TemplateBody, id?: string) {
  return dashAdminFetch<{ ok: boolean; id?: string }>(
    token,
    id ? `/menu-library/templates/${encodeURIComponent(id)}` : '/menu-library/templates',
    { method: id ? 'PUT' : 'POST', body: JSON.stringify(template) },
  );
}

export function setDishTemplateArchived(token: string, id: string, archived: boolean) {
  return dashAdminFetch<{ ok: boolean }>(token, `/menu-library/templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived }),
  });
}

export function deleteDishTemplate(token: string, id: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/menu-library/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
