import { projectId } from "../../../utils/supabase/info";
import { supabase } from "../../../utils/supabase/client";

const BASE = `https://${projectId}.supabase.co/functions/v1/petrojam-prices`;

export type RefineryCard = {
  id: string;
  slug: string;
  name: string;
  operator: string | null;
  country: string;
  place_id: string | null;
  website: string | null;
  price_source_url: string | null;
  source_kind: "petrojam_html" | "manual";
  cadence: string;
  status: "active" | "planned" | "closed";
  is_benchmark: boolean;
  location: string | null;
  latest_week: string | null;
  product_count: number;
  freshness: "Current" | "Due" | "Late" | null;
  synced_at: string | null;
  next_expected: string | null;
};

export type BoardProduct = {
  code: string;
  label: string;
  unit: string | null;
  boardGroup: "motor" | "other";
  sort: number;
  engineGrade: string | null;
  price: number | null;
  prevPrice: number | null;
  change: number | null;
  changePct: number | null;
  low52: number | null;
  high52: number | null;
  markerPct: number | null;
  sparkline: number[];
  revision: { revision: number; revisedAt: string; previous: number | null } | null;
  prevWeek: string | null;
};

export type Board = {
  week: string | null;
  prevWeek: string | null;
  weeks: string[];
  products: BoardProduct[];
};

export type SeriesPoint = {
  week: string;
  products?: Array<{ code: string; price: number; change: number | null }>;
  refinery?: string;
  name?: string;
  price?: number;
  change?: number | null;
};

export type HistoryRow = {
  week: string;
  source: string;
  cells: Record<string, { price: number; revised: boolean }>;
};

export type History = {
  page: number;
  pageSize: number;
  total: number;
  years: number[];
  spanFrom: string | null;
  spanTo: string | null;
  products: Array<{ code: string; label: string; unit: string | null }>;
  rows: HistoryRow[];
};

export type SyncRun = {
  at: string;
  trigger: string;
  mode: string | null;
  result: string;
  seconds: number | null;
  error: string | null;
};

export type Runs = {
  freshness: string | null;
  latestWeek: string | null;
  nextExpected: string | null;
  syncedAt: string | null;
  gaps: number;
  gapWeeks: string[];
  revisedWeeks: number;
  runs: SyncRun[];
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token || ""}`,
    "Content-Type": "application/json",
  };
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...(await authHeaders()), ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `Request failed (${res.status})`);
  return body as T;
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boardProduct(raw: BoardProduct): BoardProduct {
  return {
    ...raw,
    price: num(raw.price),
    prevPrice: num(raw.prevPrice),
    change: num(raw.change),
    changePct: num(raw.changePct),
    low52: num(raw.low52),
    high52: num(raw.high52),
    markerPct: num(raw.markerPct),
    sparkline: (raw.sparkline || []).map((value) => Number(value)),
  };
}

export const refineriesApi = {
  list: () => send<{ refineries: RefineryCard[]; benchmark: RefineryCard | null }>("/admin/refineries"),
  board: async (slug: string, week?: string | null) => {
    const q = week ? `?week=${week}` : "";
    const data = await send<Board>(`/admin/refineries/${slug}/board${q}`);
    return { ...data, products: (data.products || []).map(boardProduct) };
  },
  series: (slug: string, products: string[], from?: string | null, to?: string | null, compare = false) => {
    const params = new URLSearchParams();
    if (products.length) params.set("products", products.join(","));
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (compare) params.set("compare", "1");
    return send<{ compare: boolean; from?: string; to?: string; points: SeriesPoint[] }>(
      `/admin/refineries/${slug}/series?${params.toString()}`,
    );
  },
  history: (slug: string, year: number | null, page: number) => {
    const params = new URLSearchParams();
    if (year) params.set("year", String(year));
    params.set("page", String(page));
    return send<History>(`/admin/refineries/${slug}/history?${params.toString()}`);
  },
  versions: (slug: string, product: string, week: string) =>
    send<{ versions: Array<{ revision: number; price: number; source: string; reason: string | null; at: string; current: boolean }> }>(
      `/admin/refineries/${slug}/versions?product=${product}&week=${week}`,
    ),
  runs: (slug: string) => send<Runs>(`/admin/refineries/${slug}/runs?limit=10`),
  create: (body: Record<string, unknown>) => send<{ refinery: RefineryCard }>("/admin/refineries", { method: "POST", body: JSON.stringify(body) }),
  patch: (slug: string, body: Record<string, unknown>) =>
    send<{ refinery: RefineryCard }>(`/admin/refineries/${slug}`, { method: "PATCH", body: JSON.stringify(body) }),
  savePrices: (slug: string, body: Record<string, unknown>) =>
    send(`/admin/refineries/${slug}/prices`, { method: "POST", body: JSON.stringify(body) }),
  sync: (slug: string, body: { mode: string; year?: number; month?: number }) =>
    send(`/admin/refineries/${slug}/sync`, { method: "POST", body: JSON.stringify(body) }),
  patchProduct: (code: string, body: { label?: string; unit?: string }) =>
    send(`/admin/refinery-products/${code}`, { method: "PATCH", body: JSON.stringify(body) }),
};
