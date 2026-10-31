export const CATALOG_SECTION_TABS = ["Find parts", "Full database", "Import"] as const;

export type CatalogSectionTab = (typeof CATALOG_SECTION_TABS)[number];
export type CatalogTab = CatalogSectionTab | "Advanced";

export type CatalogMatch = "all" | "oem" | "sister" | "engine" | "aftermarket" | "universal";

const TAB_TO_QUERY: Record<CatalogTab, string | null> = {
  "Find parts": null,
  "Full database": "database",
  Import: "import",
  Advanced: "advanced",
};

const LEGACY_DATABASE = new Set(["vehicle", "sisters", "universal", "database", "verify"]);

export function readCatalogTab(search = window.location.search): CatalogTab {
  const value = new URLSearchParams(search).get("tab");
  if (value && LEGACY_DATABASE.has(value)) return "Full database";
  if (value === "import") return "Import";
  if (value === "advanced") return "Advanced";
  return "Find parts";
}

function pagerFrom(params: URLSearchParams) {
  const raw = params.get("p");
  if (raw) return Math.max(1, Number(raw) || 1);
  const legacy = params.get("page");
  if (legacy && legacy !== "parts-catalog" && /^\d+$/.test(legacy)) {
    return Math.max(1, Number(legacy) || 1);
  }
  return 1;
}

export function readCatalogFilters(search = window.location.search) {
  const params = new URLSearchParams(search);
  const match = params.get("match");
  const allowed: CatalogMatch[] = ["all", "oem", "sister", "engine", "aftermarket", "universal"];
  const legacyVerify = params.get("tab") === "verify";
  return {
    q: params.get("q") ?? "",
    match: (allowed.includes(match as CatalogMatch) ? match : "all") as CatalogMatch,
    brand: params.get("brand") ?? "",
    assembly: params.get("assembly") ?? "",
    variant: params.get("variant") ?? "",
    status: legacyVerify ? (params.get("status") || "needs_checking") : (params.get("status") ?? ""),
    make: params.get("make") ?? "",
    model: params.get("model") ?? "",
    year: params.get("year") ?? "",
    p: pagerFrom(params),
  };
}

type SearchPatch = {
  tab?: CatalogTab;
  variant?: string | null;
  car?: string | null;
  part?: string | null;
  pos?: string | null;
  side?: string | null;
  q?: string | null;
  match?: string | null;
  brand?: string | null;
  assembly?: string | null;
  status?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  /** Catalog list page. Never written to the app `page` slot. */
  p?: string | null;
};

const PATCH_KEYS = ["variant", "car", "part", "pos", "side", "q", "match", "brand", "assembly", "status", "make", "model", "year", "p"] as const;

/** One writer for the parts-catalog address so tab changes and Find parts deep links do not wipe each other. */
export function writeCatalogSearch(patch: SearchPatch, mode: "push" | "replace") {
  const params = new URLSearchParams(window.location.search);
  const stray = params.get("page");
  if (stray && stray !== "parts-catalog" && /^\d+$/.test(stray) && !params.get("p")) {
    params.set("p", stray);
  }
  params.set("page", "parts-catalog");
  if (params.get("tab") === "verify") {
    params.set("tab", "database");
    if (!params.get("status")) params.set("status", "needs_checking");
  }
  if (patch.tab !== undefined) {
    const query = TAB_TO_QUERY[patch.tab];
    if (query) params.set("tab", query);
    else params.delete("tab");
  }
  for (const key of PATCH_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const next = `${window.location.pathname}?${params.toString()}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next === current) return;
  const state = { page: "parts-catalog" };
  if (mode === "push") window.history.pushState(state, "", next);
  else window.history.replaceState(state, "", next);
}

/** If a bookmark still uses the pager in `page`, put the number in `p` and restore Parts database. */
export function repairCatalogAddress() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const page = params.get("page");
  let changed = false;
  if (page && page !== "parts-catalog" && /^\d+$/.test(page)) {
    if (!params.get("p")) params.set("p", page);
    params.set("page", "parts-catalog");
    changed = true;
  }
  if (params.get("page") === "parts-catalog" && params.get("tab") === "verify") {
    params.set("tab", "database");
    if (!params.get("status")) params.set("status", "needs_checking");
    changed = true;
  }
  if (!changed) return;
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({ page: "parts-catalog" }, "", next);
}

export function goDominionPage(page: string) {
  const url = new URL(window.location.href);
  url.search = `?page=${page}`;
  window.history.pushState({ page }, "", `${url.pathname}${url.search}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
