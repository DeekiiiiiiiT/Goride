// Stitch: dominion-redesign/categories_tree_tab_gas_station_selected
import {
  isRetireBlocked,
  type AdminTaxonomy,
  type BlockedBy,
  type ChangeRow,
  type TaxonomyTable,
} from "./categoriesFormat";

export class CategoriesRequestError extends Error {
  status: number;
  blocked_by?: BlockedBy;

  constructor(message: string, status: number, blocked?: BlockedBy) {
    super(message);
    this.status = status;
    this.blocked_by = blocked;
  }
}

async function send<T>(
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
    throw new CategoriesRequestError(
      body.error || "Could not load categories. Nothing was changed.",
      response.status,
      body.blocked_by,
    );
  }
  return body as T;
}

export function loadTaxonomy(apiBase: string, getToken: () => Promise<string | null>) {
  return send<AdminTaxonomy>(apiBase, getToken, "/admin/taxonomy");
}

export function loadHistory(
  apiBase: string,
  getToken: () => Promise<string | null>,
  table?: string,
  id?: string,
  limit = 50,
) {
  const params = new URLSearchParams();
  if (table) params.set("table", table);
  if (id) params.set("id", id);
  params.set("limit", String(limit));
  return send<{ rows: ChangeRow[] }>(apiBase, getToken, `/admin/taxonomy/history?${params.toString()}`);
}

export function saveTaxonomy(
  apiBase: string,
  getToken: () => Promise<string | null>,
  table: TaxonomyTable,
  id: string | null,
  body: Record<string, unknown>,
) {
  const path = id ? `/admin/taxonomy/${table}/${encodeURIComponent(id)}` : `/admin/taxonomy/${table}`;
  return send(apiBase, getToken, path, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
}

export { isRetireBlocked };
