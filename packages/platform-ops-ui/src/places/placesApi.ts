import type { ReactNode } from "react";

export type PlacesStates = {
  Loading: () => ReactNode;
  Empty: (props: { body?: string }) => ReactNode;
  Error: (props: { onRetry?: () => void }) => ReactNode;
};

export async function placesSend<T>(
  apiBase: string,
  getToken: () => Promise<string | null>,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "Could not load places") as Error & { missing?: string[] };
    error.missing = body.missing;
    throw error;
  }
  return body as T;
}

export type Taxonomy = {
  groups: { code: string; label: string; colour: string; sort: number }[];
  categories: { code: string; group_code: string; label: string; sort: number }[];
  placeTypes: {
    slug: string;
    category_code: string;
    label: string;
    default_geofence_m: number;
    default_facilities: string[];
    match_profile: string;
    attribute_schema: { properties?: Record<string, { type?: string; title?: string; items?: { type?: string } }> } | null;
  }[];
  facilityTypes: {
    slug: string;
    category_code: string;
    label: string;
    icon: string | null;
    attribute_schema: { properties?: Record<string, { type?: string; title?: string }> } | null;
  }[];
  brands: { id: string; name: string; slug: string }[];
  plugChips?: {
    chip: string;
    placeType: string;
    label: string;
    mapLabel: string;
    icon: string;
    empty: string;
    sort: number;
  }[];
};

export function readPlacesQuery(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") || "",
    group: params.get("group") || "",
    category: params.get("category") || "",
    type: params.get("type") || "",
    status: params.get("status") || "",
    p: params.get("p") || "1",
  };
}

export function writePlacesQuery(next: Record<string, string>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(next)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}
