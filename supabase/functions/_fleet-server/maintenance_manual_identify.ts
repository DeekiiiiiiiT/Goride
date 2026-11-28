/**
 * Step 6b — DOC-01: what document is this?
 *
 * The owner drops a PDF in. Before anything is uploaded, the browser reads the text layer of the first pages and
 * the contents page (free, local) and sends that text here. One small DeepSeek call reads the text — or, for a
 * scanned document with no text layer, the first six page pictures — and answers with the things a person would
 * write on the form: the make, the model, the date printed on the document, the market, the document type, a
 * title, the page offset (printed page vs PDF page) and the pages worth reading, each with a reason.
 *
 * This module owns the prompt, the tolerant parsing of the answer, and the two decisions that are ours, not the
 * model's:
 *   - which catalogue family the document belongs to (make and model, in plain words),
 *   - which catalogue years the printed date covers (a June 2021 sheet is the 2020-on cars, never 2016).
 *
 * The answer is always in plain words: never a code, never an ID.
 */
import { trackedProviderCall, type ProviderCallEntry } from "./api_usage_logger.ts";
import { DEEPSEEK_VISION_MODEL } from "./deepseek_models.ts";

export const IDENTIFY_ROUTE = "maintenance-manual-reader/identify";
/** One identify call may take this long. */
export const IDENTIFY_TIMEOUT_MS = 30_000;
/** The text the browser sends is trimmed to this before it reaches the model. */
export const MAX_IDENTIFY_TEXT_CHARS = 24_000;
/** A document is never worth more suggested pages than this; a bigger answer is a confused read. */
export const MAX_SUGGESTED_PAGES = 80;

export const DEEPSEEK_API_BASE = "https://api.deepseek.com";

export const DOC_TYPES = ["schedule", "owners_manual"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const MARKETS = ["JM", "GEN", "JP", "OTHER"] as const;
export type Market = (typeof MARKETS)[number];

export type IdentifyPageText = { pdf_page: number; text: string };

/** One page Roam suggests reading, and why (in plain words). */
export type SuggestedPage = { pdf_page: number; printed_page: number | null; reason: string };

/** How sure Roam is about one field of the form, and why. */
export type FieldConfidence = { sure: boolean; reason: string };

export type IdentifyAnswer = {
  make: string | null;
  model: string | null;
  /** The date printed on the document, YYYY-MM-DD, or null when it prints none. */
  printed_date: string | null;
  market: Market | null;
  doc_type: DocType;
  title: string;
  /** printed page = PDF page - this. */
  page_offset: number;
  pages: SuggestedPage[];
  fields: {
    make: FieldConfidence;
    model: FieldConfidence;
    printed_date: FieldConfidence;
    market: FieldConfidence;
    doc_type: FieldConfidence;
    title: FieldConfidence;
    page_offset: FieldConfidence;
    pages: FieldConfidence;
  };
};

const MAX_LINE = 160;

function text(value: unknown, max = MAX_LINE): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function nullableText(value: unknown, max = MAX_LINE): string | null {
  const t = text(value, max);
  if (!t || /^(null|none|n\/?a|unknown|-+|—)$/i.test(t)) return null;
  return t;
}

/** The model may answer "Japan", "JP" or "Japanese market". All three mean JP. */
export function toMarket(value: unknown): Market | null {
  const t = text(value, 40).toLowerCase();
  if (!t) return null;
  if (/^(jp|japan|japanese)\b/.test(t) || t.includes("japan")) return "JP";
  if (/^(jm|jamaica|jamaican)\b/.test(t) || t.includes("jamaica")) return "JM";
  if (/^(gen|export|general|gcc|europe)\b/.test(t) || t.includes("export")) return "GEN";
  if (/^(other|other market)\b/.test(t)) return "OTHER";
  return null;
}

/** "owner's manual", "owners manual", "Owner manual" and "OM" all mean the owner's manual. */
export function toDocType(value: unknown): DocType | null {
  const t = text(value, 60).toLowerCase();
  if (!t) return null;
  if (/owner|instruction manual|user manual|\bom\b/.test(t)) return "owners_manual";
  if (/schedule|booklet|maintenance (sheet|list|record|table)|点検整備|メンテナンスノート/.test(t)) return "schedule";
  return null;
}

/** A printed date as YYYY-MM-DD, or null. Accepts 2021-06-01, 2021/6/1 and 1 June 2021. */
export function toDate(value: unknown): string | null {
  const t = text(value, 40);
  if (!t) return null;

  const iso = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return validDate(Number(y), Number(m), Number(d));
  }

  const jp = t.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日$/);
  if (jp) return validDate(Number(jp[1]), Number(jp[2]), Number(jp[3]));

  const words = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (words) {
    const month = MONTHS[words[2].toLowerCase()];
    if (month) return validDate(Number(words[3]), month, Number(words[1]));
  }

  // A bare month and year (2021-06) is a date to the month: keep the first day.
  const monthOnly = t.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (monthOnly) return validDate(Number(monthOnly[1]), Number(monthOnly[2]), 1);

  return null;
}

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
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function validDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

function toOffset(value: unknown): number {
  const n = typeof value === "number" ? value : Number(text(value, 10));
  if (!Number.isFinite(n)) return 0;
  const whole = Math.round(n);
  if (whole < -50 || whole > 50) return 0;
  return whole;
}

function toConfidence(value: unknown): FieldConfidence {
  if (value === true) return { sure: true, reason: "" };
  if (value === false) return { sure: false, reason: "" };
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return {
      sure: obj.sure === true || obj.confident === true,
      reason: text(obj.reason ?? obj.why ?? obj.note, 240),
    };
  }
  return { sure: false, reason: "" };
}

function toPages(raw: unknown, pageCount: number | null): SuggestedPage[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: SuggestedPage[] = [];
  const seen = new Set<number>();
  const add = (pageNo: number, reason: string) => {
    if (!Number.isInteger(pageNo) || pageNo < 1) return;
    if (pageCount != null && pageNo > pageCount) return;
    if (seen.has(pageNo) || out.length >= MAX_SUGGESTED_PAGES) return;
    seen.add(pageNo);
    out.push({ pdf_page: pageNo, printed_page: null, reason });
  };
  for (const item of list) {
    if (typeof item === "number") {
      add(item, "");
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const reason = text(obj.reason ?? obj.why, 240);
    // A run of pages, e.g. the whole specifications chapter: {"from": 524, "to": 530}.
    const from = Number(obj.from ?? obj.pdf_from ?? obj.start);
    const to = Number(obj.to ?? obj.pdf_to ?? obj.end);
    if (Number.isInteger(from) && Number.isInteger(to) && to >= from && to - from < MAX_SUGGESTED_PAGES) {
      for (let p = from; p <= to; p++) add(p, reason);
      continue;
    }
    const n = Number(obj.pdf_page ?? obj.page ?? obj.page_no);
    if (Number.isFinite(n)) add(n, reason);
  }
  return out.sort((a, b) => a.pdf_page - b.pdf_page);
}

/**
 * Turn the model's answer into the shape the form uses. Anything that does not fit is dropped, and a field the
 * model was silent about is marked unsure — never guessed.
 */
export function parseIdentifyAnswer(raw: unknown, pageCount: number | null = null): IdentifyAnswer {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields = obj.fields && typeof obj.fields === "object" ? (obj.fields as Record<string, unknown>) : {};

  const docType = toDocType(obj.doc_type ?? obj.document_type ?? obj.docType) ?? "schedule";
  const pageOffset = toOffset(obj.page_offset ?? obj.pageOffset ?? obj.offset);
  const pages = toPages(obj.pages ?? obj.suggested_pages ?? obj.suggestedPages, pageCount).map((page) => ({
    ...page,
    printed_page: printedPageOrNull(page.pdf_page, pageOffset),
  }));

  const make = nullableText(obj.make ?? obj.manufacturer, 60);
  const model = nullableText(obj.model, 60);
  const title = text(obj.title, 200) || [make, model].filter(Boolean).join(" ") || "Car document";

  return {
    make,
    model,
    printed_date: toDate(obj.printed_date ?? obj.printedDate ?? obj.date),
    market: toMarket(obj.market),
    doc_type: docType,
    title,
    page_offset: pageOffset,
    pages,
    fields: {
      make: toConfidence(fields.make),
      model: toConfidence(fields.model),
      printed_date: toConfidence(fields.printed_date ?? fields.printedDate),
      market: toConfidence(fields.market),
      doc_type: toConfidence(fields.doc_type ?? fields.docType),
      title: toConfidence(fields.title),
      page_offset: toConfidence(fields.page_offset ?? fields.pageOffset),
      pages: toConfidence(fields.pages),
    },
  };
}

/** The prompt. The page text goes below the rules, exactly as it came out of the PDF. */
export function buildIdentifyPrompt(args: {
  fileName: string;
  pageCount: number;
  pages: IdentifyPageText[];
  /** One short line per PDF page (its running header), so pages deep in a thick book can be found. */
  pageHeads?: IdentifyPageText[];
  hasImages?: boolean;
}): string {
  const name = text(args.fileName, 160) || "a car document";
  const pageLines = (Array.isArray(args.pages) ? args.pages : [])
    .filter((page) => page && Number.isInteger(page.pdf_page) && page.pdf_page >= 1)
    .sort((a, b) => a.pdf_page - b.pdf_page)
    .map((page) => `--- PDF PAGE ${page.pdf_page} ---\n${String(page.text ?? "").slice(0, 4000)}`)
    .join("\n");
  const headLines = (Array.isArray(args.pageHeads) ? args.pageHeads : [])
    .filter((page) => page && Number.isInteger(page.pdf_page) && page.pdf_page >= 1)
    .sort((a, b) => a.pdf_page - b.pdf_page)
    .map((page) => `${page.pdf_page}: ${String(page.text ?? "").replace(/\s+/g, " ").slice(0, 100)}`)
    .join("\n");

  return [
    `You are looking at the first pages of a car document: "${name}", ${args.pageCount} pages in the PDF.`,
    "Tell Roam what this document is, so the upload form can be filled in for the owner to check.",
    "",
    "Return JSON only, in this exact shape:",
    '{"make":"<car maker>","model":"<model>","printed_date":"<YYYY-MM-DD or null>",',
    '"market":"JM"|"GEN"|"JP"|"OTHER"|null,"doc_type":"schedule"|"owners_manual",',
    '"title":"<short plain title>","page_offset":<whole number>,',
    '"pages":[{"pdf_page":<number>,"reason":"<why>"} or {"from":<pdf page>,"to":<pdf page>,"reason":"<why>"}],',
    '"fields":{"make":{"sure":true|false,"reason":"<one line>"},"model":{...},"printed_date":{...},',
    '"market":{...},"doc_type":{...},"title":{...},"page_offset":{...},"pages":{...}}}',
    "",
    "Rules:",
    "- doc_type is \"schedule\" for a maintenance booklet, a maintenance sheet or an export manual's schedule",
    "  chapter: a document whose job is service intervals. It is \"owners_manual\" for the car maker's owner's",
    "  manual: the thick book whose specifications chapter gives fluids, tyres, battery and bulbs.",
    "- printed_date is the date PRINTED ON the document, not today's date and not the model year. A Japanese",
    "  sheet prints it in the header, for example 2021年6月1日. Answer null only when the document prints none.",
    "- market is the market the document was written for: JM Jamaica, GEN export/general, JP Japan, OTHER.",
    "- page_offset makes a PDF page into the page number printed on it: printed = PDF page - page_offset.",
    "  This book's front matter is usually unnumbered, so the offset is the number of unnumbered pages before",
    "  printed page 1. Answer 0 when the document prints no page numbers.",
    "- pages is the list of PDF pages worth reading, each with a short plain reason: the schedule table, the",
    "  specifications pages (capacities, tyres, battery, bulbs), and the page that names the engine. Skip feature",
    "  pages, controls, audio, troubleshooting and the index: they carry no numbers the owner needs.",
    "- When the page headers list is given, use it to find those pages anywhere in the book, not only in the first",
    "  pages. For an owner's manual give the WHOLE specifications chapter as one run (from its first to its last",
    "  page; in a Japanese book it is headed 仕様一覧 or 主要諸元) and the front page that names the model and",
    "  engine. Skip the care and maintenance chapter when the specifications chapter prints the same numbers",
    "  (oil, tyre pressure): the same value from two pages is a duplicate. Use PDF page numbers.",
    "- For every field, sure is true only when the document says it plainly; otherwise false and say what is",
    "  missing in one line. Never guess a value to fill the form.",
    "- Titles are plain words, never codes: \"Toyota Roomy 2021 owner's manual\", not \"OM-ROOMY-21\".",
    "- Answer with the JSON object only: no prose, no markdown, no code fence.",
    "",
    args.hasImages
      ? "The document has no text layer; its first pages are attached as pictures."
      : "The document's own text, page by page, is below.",
    pageLines,
    headLines ? `\n--- PAGE HEADERS (PDF page: first words on the page) ---\n${headLines}` : "",
  ].join("\n");
}

export type IdentifyReaderDeps = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  guards?: () => Promise<void>;
  log?: (entry: ProviderCallEntry) => Promise<void>;
};

export type IdentifyRequest = {
  fileName: string;
  pageCount: number;
  pages: IdentifyPageText[];
  pageHeads?: IdentifyPageText[];
  /** Base64 page pictures, for a document with no text layer. */
  pageImages?: string[];
  imagesMimeType?: string;
};

/**
 * One DeepSeek call that reads the document's opening pages and answers the form. Sends text when the document
 * has a text layer, pictures when it does not; the prompt and the rules are the same either way.
 */
export function callDeepSeekIdentify(apiKey: string | undefined, deps: IdentifyReaderDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? IDENTIFY_TIMEOUT_MS;

  return async (input: IdentifyRequest): Promise<unknown> => {
    const key = (apiKey ?? "").trim();
    if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");

    const images = (input.pageImages ?? []).filter((image) => typeof image === "string" && image.length > 0);
    const prompt = buildIdentifyPrompt({
      fileName: input.fileName,
      pageCount: input.pageCount,
      pages: images.length ? [] : input.pages,
      pageHeads: input.pageHeads,
      hasImages: images.length > 0,
    });

    const content: unknown = images.length
      ? [
        { type: "text", text: prompt },
        ...images.map((data) => ({
          type: "image_url",
          image_url: { url: `data:${input.imagesMimeType ?? "image/jpeg"};base64,${data}` },
        })),
      ]
      : prompt;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const answer = await trackedProviderCall<{
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>({
        provider: "deepseek",
        service: "vision",
        route: IDENTIFY_ROUTE,
        model: DEEPSEEK_VISION_MODEL,
        guards: deps.guards,
        log: deps.log,
        run: async () => {
          const res = await fetchImpl(`${DEEPSEEK_API_BASE}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            signal: controller.signal,
            body: JSON.stringify({
              model: DEEPSEEK_VISION_MODEL,
              messages: [{ role: "user", content }],
              response_format: { type: "json_object" },
              thinking: { type: "disabled" },
              temperature: 0,
              max_tokens: 2000,
              stream: false,
            }),
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`DeepSeek HTTP ${res.status}: ${body.slice(0, 300)}`);
          }
          return await res.json();
        },
        extractUsage: (r) => ({
          inputTokens: r?.usage?.prompt_tokens,
          outputTokens: r?.usage?.completion_tokens,
        }),
      });

      const answerText = answer.choices?.[0]?.message?.content ?? "";
      if (!answerText.trim()) throw new Error("The document reader answered with nothing.");
      return JSON.parse(answerText) as unknown;
    } finally {
      clearTimeout(timer);
    }
  };
}

// ---------------------------------------------------------------------------
// What a person chose in the catalogue, and which years the printed date covers
// ---------------------------------------------------------------------------

export type CatalogueFamily = {
  platform_id: string;
  /** The family's plain name, e.g. "Toyota Roomy 2016–2020". */
  name: string;
  make: string | null;
  model: string | null;
  /** The catalogue years of every version under the family. Null end means "still in production". */
  years: Array<{ from: number | null; to: number | null }>;
  /** The platform row's own label, e.g. "Roomy / Tank / Thor / Justy · 2WD (M900)": tells two families apart. */
  label?: string | null;
  /** Every make + model of the catalogue cars under the family (one family can be sold by several makers). */
  cars?: Array<{ make: string | null; model: string | null }>;
};

/** Flattened words, so "Toyota" and "TOYOTA " are the same, and "Roomy" finds "Roomy (Japan)". */
function flat(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The catalogue family a document is about. The make must agree, and the model must be the catalogue's model or
 * a name that contains it (the catalogue calls a car "Roomy" where the document says "Roomy (Japan)").
 * Two families fit equally well only when nothing chooses between them — and then Roam says it is unsure
 * instead of picking one.
 */
export function matchCatalogueFamily(
  families: CatalogueFamily[],
  make: string | null,
  model: string | null,
): { family: CatalogueFamily | null; closeNames: string[]; closeFamilies: CatalogueFamily[] } {
  const wantedMake = flat(make);
  const wantedModel = flat(model);
  if (!wantedModel) return { family: null, closeNames: [], closeFamilies: [] };

  const scored: Array<{ family: CatalogueFamily; score: number }> = [];
  for (const family of families) {
    const name = flat(family.name);
    // A family is shared by several makes (Roomy, Tank, Thor, Justy): every catalogue car under it can match.
    const candidates = [{ make: family.make, model: family.model }, ...(family.cars ?? [])];
    let familyScore = 0;
    for (const car of candidates) {
      const carMake = flat(car.make);
      const carModel = flat(car.model);
      if (wantedMake && carMake && carMake !== wantedMake) continue;

      let score = 0;
      if (carModel && carModel === wantedModel) score = 4;
      else if (carModel && (carModel.includes(wantedModel) || wantedModel.includes(carModel))) score = 3;
      else if (name.includes(wantedModel)) score = 2;
      if (!score) continue;
      if (wantedMake && carMake === wantedMake) score += 1;
      familyScore = Math.max(familyScore, score);
    }
    if (familyScore) scored.push({ family, score: familyScore });
  }

  if (!scored.length) return { family: null, closeNames: [], closeFamilies: [] };

  const best = Math.max(...scored.map((row) => row.score));
  const winners = scored.filter((row) => row.score === best);
  if (winners.length > 1) {
    return {
      family: null,
      closeNames: winners.map((row) => row.family.name).sort(),
      closeFamilies: winners.map((row) => row.family),
    };
  }
  return { family: winners[0].family, closeNames: [], closeFamilies: [] };
}

/**
 * Which model years a dated document covers, from the catalogue's own version years. The printed year must fall
 * inside a version's range; the document then covers that version's whole range. A June 2021 sheet is the
 * 2020-on cars, never the 2016-2020 ones, and never "every year the model was made".
 */
export function chooseYears(
  printedDate: string | null,
  years: Array<{ from: number | null; to: number | null }>,
): { year_from: number | null; year_to: number | null; fromPrintedDate: boolean } {
  const printedYear = printedDate && /^\d{4}/.test(printedDate) ? Number(printedDate.slice(0, 4)) : null;
  const clean = years.filter((y) => y && (y.from != null || y.to != null));
  if (!clean.length) {
    return { year_from: printedYear, year_to: null, fromPrintedDate: printedYear != null };
  }

  if (printedYear != null) {
    const covering = clean.filter((y) => {
      const from = y.from ?? 0;
      const to = y.to ?? 9999;
      return printedYear >= from && printedYear <= to;
    });
    if (covering.length) {
      const from = Math.min(...covering.map((y) => y.from ?? printedYear));
      // An open end wins: a document for a car still in production speaks for every later year.
      const hasOpenEnd = covering.some((y) => y.to == null);
      const to = hasOpenEnd ? null : Math.max(...covering.map((y) => y.to as number));
      return { year_from: from, year_to: to, fromPrintedDate: false };
    }
  }

  const from = Math.min(...clean.map((y) => y.from ?? 0));
  const hasOpenEnd = clean.some((y) => y.to == null);
  const to = hasOpenEnd ? null : Math.max(...clean.map((y) => y.to as number));
  return { year_from: from || null, year_to: to, fromPrintedDate: false };
}

/** printed page = PDF page - offset. Every page a person sees comes through here. */
export function printedPage(pdfPage: number, pageOffset: number | null | undefined): number {
  return Number(pdfPage) - Number(pageOffset ?? 0);
}

/**
 * The printed page, or null when the PDF page has no number printed on it (a book's front matter). Never a
 * negative page: "page -1" is not a page anybody can turn to.
 */
export function printedPageOrNull(pdfPage: number, pageOffset: number | null | undefined): number | null {
  const printed = printedPage(pdfPage, pageOffset);
  return printed > 0 ? printed : null;
}

/**
 * The page offset counted from the book itself: most pages start (or end) with their printed number, so
 * PDF page − printed number is the same on hundreds of pages. Null when the book does not show it clearly
 * (fewer than 20 pages agree, or no one gap wins at least half the votes); then the reader's answer stands.
 */
export function offsetFromPageHeads(heads: IdentifyPageText[]): number | null {
  const votes = new Map<number, number>();
  let total = 0;
  for (const head of heads) {
    const words = String(head.text ?? "").trim().split(/\s+/);
    const candidates = new Set<number>();
    for (const word of [words[0], words[words.length - 1]]) {
      if (word && /^\d{1,4}$/.test(word)) candidates.add(Number(word));
    }
    for (const printed of candidates) {
      const gap = head.pdf_page - printed;
      if (gap < 0 || gap > 50) continue;
      votes.set(gap, (votes.get(gap) ?? 0) + 1);
      total += 1;
    }
  }
  let best: number | null = null;
  let bestVotes = 0;
  for (const [gap, n] of votes) {
    if (n > bestVotes) {
      best = gap;
      bestVotes = n;
    }
  }
  if (best == null || bestVotes < 20 || bestVotes * 2 < total) return null;
  return best;
}

/** The reader's answer with the counted offset in place, and every page's printed number redone from it. */
export function withCountedOffset(answer: IdentifyAnswer, heads: IdentifyPageText[]): IdentifyAnswer {
  const counted = offsetFromPageHeads(heads);
  if (counted == null || counted === answer.page_offset) return answer;
  return {
    ...answer,
    page_offset: counted,
    pages: answer.pages.map((page) => ({ ...page, printed_page: printedPageOrNull(page.pdf_page, counted) })),
    fields: { ...answer.fields, page_offset: { sure: true, reason: "Counted from the page numbers printed in the book." } },
  };
}
