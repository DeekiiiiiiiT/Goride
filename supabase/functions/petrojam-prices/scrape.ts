/**
 * Parse Petrojam prices HTML table + paginated / year-filtered archive scrape.
 * Site uses Toolset Views: wpv_view_count + wpv_paged, year filter wpcf_price_date.
 */

export type PetrojamPriceRow = {
  priceDate: string; // YYYY-MM-DD
  gasolene87: number | null;
  gasolene90: number | null;
  autoDiesel: number | null;
  kerosene: number | null;
  propane: number | null;
  butane: number | null;
  hfo: number | null;
  asphalt: number | null;
  ulsd: number | null;
};

export type PetrojamSyncMode = "latest" | "year" | "month" | "all";

export type PetrojamFetchOptions = {
  mode?: PetrojamSyncMode;
  year?: number;
  month?: number; // 1-12
  /** Safety cap for full archive (Petrojam currently ~59 pages). */
  maxPages?: number;
  delayMs?: number;
};

export type PetrojamFetchResult = {
  rows: PetrojamPriceRow[];
  pagesFetched: number;
  mode: PetrojamSyncMode;
  year?: number;
  month?: number;
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const EXPECTED_HEADERS = [
  "date",
  "gasolene 87",
  "gasolene 90",
  "auto diesel",
  "kerosene",
  "propane",
  "butane",
  "hfo",
  "asphalt",
  "ulsd",
];

/** Years Petrojam exposes in the Price Date dropdown (server-side filter). */
export const PETROJAM_YEAR_FILTER_MIN = 2010;
export const PETROJAM_YEAR_FILTER_MAX = 2021;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

export const PETROJAM_PRICE_URL = "https://www.petrojam.com/price/";

export function parsePetrojamDate(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const m = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!day || !year || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseNum(raw: string): number | null {
  const t = raw.replace(/,/g, "").trim();
  if (!t || t === "-" || t === "—") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCellHtml(rowHtml: string): string[] {
  const cells: string[] = [];
  const re = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml)) !== null) {
    cells.push(stripTags(m[1]));
  }
  return cells;
}

export function parsePetrojamPricesHtml(html: string): PetrojamPriceRow[] {
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    throw new Error("No price table found on Petrojam page");
  }
  const tableHtml = tableMatch[0];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows: string[][] = [];
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(tableHtml)) !== null) {
    const cells = extractCellHtml(rm[1]);
    if (cells.length) rows.push(cells);
  }
  if (rows.length < 2) {
    throw new Error("Petrojam price table has no data rows");
  }

  const header = rows[0].map((h) => h.toLowerCase().trim());
  if (header.length < 10) {
    throw new Error(`Unexpected Petrojam columns (${header.length}): ${header.join(" | ")}`);
  }
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    const got = header[i] || "";
    if (!got.includes(EXPECTED_HEADERS[i].split(" ")[0]) && got !== EXPECTED_HEADERS[i]) {
      if (i === 0 && !got.includes("date")) {
        throw new Error(`Unexpected Petrojam header row: ${header.join(" | ")}`);
      }
    }
  }

  const out: PetrojamPriceRow[] = [];
  for (const cells of rows.slice(1)) {
    if (cells.length < 10) continue;
    const priceDate = parsePetrojamDate(cells[0]);
    if (!priceDate) continue;
    out.push({
      priceDate,
      gasolene87: parseNum(cells[1]),
      gasolene90: parseNum(cells[2]),
      autoDiesel: parseNum(cells[3]),
      kerosene: parseNum(cells[4]),
      propane: parseNum(cells[5]),
      butane: parseNum(cells[6]),
      hfo: parseNum(cells[7]),
      asphalt: parseNum(cells[8]),
      ulsd: parseNum(cells[9]),
    });
  }

  if (!out.length) {
    throw new Error("Parsed Petrojam table but found no valid price rows");
  }
  return out;
}

/** Prefer Toolset view id like 1537-TCPID11234 over bare numeric widgets. */
export function extractViewCount(html: string): string | null {
  const all = [...html.matchAll(/wpv_view_count=([^"'&\s<#]+)/gi)].map((m) =>
    decodeURIComponent(m[1].replace(/&#038;/g, "&")),
  );
  const preferred = all.find((v) => /-\w+/.test(v) && v.startsWith("1537"));
  return preferred || all.find((v) => /-\w+/.test(v)) || all[0] || null;
}

export function extractMaxPaged(html: string): number {
  const pages = [...html.matchAll(/wpv_paged=(\d+)/g)].map((m) => Number(m[1]));
  return pages.length ? Math.max(...pages) : 1;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 20_000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    });
    if (!res.ok) throw new Error(`Petrojam fetch failed: HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function buildPageUrl(viewCount: string, page: number, yearFilter?: number): string {
  const params = new URLSearchParams();
  params.set("wpv_view_count", viewCount);
  params.set("wpv_paged", String(page));
  if (yearFilter != null) params.set("wpcf_price_date", String(yearFilter));
  return `${PETROJAM_PRICE_URL}?${params.toString()}`;
}

function supportsYearFilter(year: number): boolean {
  return year >= PETROJAM_YEAR_FILTER_MIN && year <= PETROJAM_YEAR_FILTER_MAX;
}

function rowYear(row: PetrojamPriceRow): number {
  return Number(row.priceDate.slice(0, 4));
}

function rowMonth(row: PetrojamPriceRow): number {
  return Number(row.priceDate.slice(5, 7));
}

function dedupeByDate(rows: PetrojamPriceRow[]): PetrojamPriceRow[] {
  const map = new Map<string, PetrojamPriceRow>();
  for (const r of rows) map.set(r.priceDate, r);
  return [...map.values()].sort((a, b) => b.priceDate.localeCompare(a.priceDate));
}

async function scrapePages(
  viewCount: string,
  maxPages: number,
  opts: {
    yearFilter?: number;
    delayMs: number;
    fetchImpl: typeof fetch;
    /** Stop early when a page has no rows matching local filter (for unfiltered archive scans). */
    keepRow?: (row: PetrojamPriceRow) => boolean;
    /** If true, stop after a full page with zero kept rows once we already have some. */
    stopWhenPastRange?: boolean;
  },
): Promise<{ rows: PetrojamPriceRow[]; pagesFetched: number }> {
  const collected: PetrojamPriceRow[] = [];
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(opts.delayMs);
    const url = buildPageUrl(viewCount, page, opts.yearFilter);
    const html = await fetchHtml(url, opts.fetchImpl);
    // Refresh view count if page rewrites TCPID
    const vc = extractViewCount(html) || viewCount;
    const pageRows = parsePetrojamPricesHtml(html);
    pagesFetched += 1;

    const kept = opts.keepRow ? pageRows.filter(opts.keepRow) : pageRows;
    collected.push(...kept);

    if (opts.stopWhenPastRange && opts.keepRow && pageRows.length > 0 && kept.length === 0 && collected.length > 0) {
      // Archive is newest-first: once nothing on the page matches, we're past the target range.
      break;
    }

    // Last page often has fewer rows
    if (pageRows.length < 10 && page > 1) break;

    // If site reports a lower max for this filtered view, respect it
    const reportedMax = extractMaxPaged(html);
    if (reportedMax > 0 && page >= reportedMax) break;

    // Update viewCount for subsequent pages if TCPID changed
    if (vc !== viewCount) viewCount = vc;
  }

  return { rows: dedupeByDate(collected), pagesFetched };
}

export async function fetchPetrojamLatestPrices(
  fetchImpl: typeof fetch = fetch,
): Promise<PetrojamPriceRow[]> {
  const result = await fetchPetrojamPrices({ mode: "latest" }, fetchImpl);
  return result.rows;
}

/**
 * Scrape Petrojam prices:
 * - latest: first page only
 * - year: all weeks in that year
 * - month: all weeks in year+month
 * - all: full archive (paginated)
 */
export async function fetchPetrojamPrices(
  options: PetrojamFetchOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<PetrojamFetchResult> {
  const mode: PetrojamSyncMode = options.mode || "latest";
  const delayMs = Math.min(Math.max(options.delayMs ?? 350, 150), 2000);
  const maxPagesCap = Math.min(Math.max(options.maxPages ?? 59, 1), 80);

  if (mode === "latest") {
    const html = await fetchHtml(PETROJAM_PRICE_URL, fetchImpl);
    return {
      rows: parsePetrojamPricesHtml(html),
      pagesFetched: 1,
      mode,
    };
  }

  if (mode === "year" || mode === "month") {
    const year = options.year;
    if (!year || year < 2004 || year > 2100) {
      throw new Error("Valid year is required for year/month sync");
    }
    if (mode === "month") {
      const month = options.month;
      if (!month || month < 1 || month > 12) {
        throw new Error("Valid month (1–12) is required for month sync");
      }
    }

    const seedUrl = supportsYearFilter(year)
      ? `${PETROJAM_PRICE_URL}?wpcf_price_date=${year}`
      : PETROJAM_PRICE_URL;
    const seedHtml = await fetchHtml(seedUrl, fetchImpl);
    const viewCount = extractViewCount(seedHtml);
    if (!viewCount) throw new Error("Could not find Petrojam pagination view id");

    const reportedMax = extractMaxPaged(seedHtml);
    const maxPages = supportsYearFilter(year)
      ? Math.min(Math.max(reportedMax, 1), 10)
      : maxPagesCap;

    const month = mode === "month" ? options.month! : undefined;
    const keepRow = (row: PetrojamPriceRow) => {
      if (rowYear(row) !== year) return false;
      if (month != null && rowMonth(row) !== month) return false;
      return true;
    };

    const { rows, pagesFetched } = await scrapePages(viewCount, maxPages, {
      yearFilter: supportsYearFilter(year) ? year : undefined,
      delayMs,
      fetchImpl,
      keepRow,
      stopWhenPastRange: !supportsYearFilter(year),
    });

    if (!rows.length) {
      throw new Error(
        mode === "month"
          ? `No Petrojam prices found for ${year}-${String(month).padStart(2, "0")}`
          : `No Petrojam prices found for ${year}`,
      );
    }

    return { rows, pagesFetched, mode, year, month };
  }

  // mode === "all"
  const seedHtml = await fetchHtml(PETROJAM_PRICE_URL, fetchImpl);
  const viewCount = extractViewCount(seedHtml);
  if (!viewCount) throw new Error("Could not find Petrojam pagination view id");
  const reportedMax = extractMaxPaged(seedHtml);
  const maxPages = Math.min(Math.max(reportedMax, 1), maxPagesCap);

  const { rows, pagesFetched } = await scrapePages(viewCount, maxPages, {
    delayMs,
    fetchImpl,
  });

  return { rows, pagesFetched, mode: "all" };
}
