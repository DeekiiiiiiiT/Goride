import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type { HaulageCatalogResponse } from '@roam/types/haulage';

async function haulageHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? publicAnonKey;
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

export async function fetchHaulageCatalog(): Promise<HaulageCatalogResponse> {
  const res = await fetch(`${API_ENDPOINTS.rides}/v1/haulage/catalog`, {
    headers: await haulageHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Catalog failed (${res.status})`);
  }
  return res.json() as Promise<HaulageCatalogResponse>;
}

export function useHaulageCatalog() {
  return useQuery({
    queryKey: ['haulage', 'catalog'],
    queryFn: fetchHaulageCatalog,
    staleTime: 60_000,
  });
}

export function getCatalogItem(
  catalog: HaulageCatalogResponse | undefined,
  itemId: string,
) {
  return catalog?.items.find((i) => i.id === itemId);
}

export function getCatalogVariant(
  catalog: HaulageCatalogResponse | undefined,
  itemId: string,
  variantId: string,
) {
  const item = getCatalogItem(catalog, itemId);
  return item?.variants.find((v) => v.id === variantId);
}

export function getItemGroupsForCatalogCategory(
  catalog: HaulageCatalogResponse,
  categoryId: string,
) {
  const items = catalog.items.filter((i) => i.category_id === categoryId);
  if (categoryId !== 'appliances') {
    return [{ subgroupId: null as string | null, title: null as string | null, items }];
  }
  return catalog.subgroups
    .filter((s) => s.category_id === categoryId)
    .map((sub) => ({
      subgroupId: sub.id,
      title: sub.title,
      items: items.filter((i) => i.subgroup_id === sub.id),
    }))
    .filter((g) => g.items.length > 0);
}
