/**
 * Step 3 — the owner's manual reader routes (fleet-ops).
 *
 * The file never passes through a function: the app asks for a one-time PUT link, sends the PDF straight to the
 * private R2 bucket, then says "uploaded" and the server checks the file and queues its pages. Reading happens in
 * the maintenance-manual-worker function, one page per job.
 *
 * Permissions match the maintenance master: staff may upload and edit drafts (`catalog.write`); approving,
 * rejecting, stopping and therefore making a rule live is the owner's call (`catalog.govern`).
 *
 * Every answer carries a plain-English `error` the screen can show as it is.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { familyNames } from "./maintenance_family_names.ts";
import { assertCatalogGovernResponse, assertCatalogWriteResponse, catalogActorId } from "./catalog_access.ts";
import { detectFileMagicBytes } from "../_shared/fileMagic.ts";
import { countPdfPages, extractPdfPage, MAX_MANUAL_BYTES, PdfProblemError } from "./maintenance_manual_pdf.ts";
import {
  callDeepSeekIdentify,
  chooseYears,
  type IdentifyPageText,
  matchCatalogueFamily,
  parseIdentifyAnswer,
  withCountedOffset,
  printedPageOrNull,
  printedPage,
  toDocType,
} from "./maintenance_manual_identify.ts";
import {
  headManualFile,
  isManualStorageEnabled,
  manualFileKey,
  manualPageLink,
  manualPagePdfKey,
  manualStorageOffMessage,
  presignManualUpload,
  putManualPage,
  readManualFile,
  sha256OfBytes,
} from "./maintenance_manual_storage.ts";
import { assertPlatformStaffResponse, requireAuth } from "./rbac_middleware.ts";

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
};

const MARKETS = ["JM", "GEN", "JP", "OTHER"];
const PAGE_SIZE = 25;
const MAX_TITLE = 200;
const MAX_REASON = 500;
/** The text the browser sends for identification is trimmed to this before it reaches the model. */
const MAX_IDENTIFY_BODY_CHARS = 120_000;

const MANUAL_COLUMNS =
  "id, platform_id, market, title, file_key, file_sha256, page_count, page_from, page_to, pages, doc_type, page_offset, year_from, year_to, printed_date, status, progress_page, uploaded_by, uploaded_at, checked_by, checked_at, reject_reason, stop_reason, created_at, updated_at";

const DRAFT_COLUMNS =
  "id, manual_id, evidence_page, component_id, task_name, task_code, interval_km, interval_months, severe_interval_km, severe_interval_months, severe_same_as_normal, first_interval_km, first_interval_months, year_from, year_to, status, source_type, confidence, draft_note, verified_at, updated_at";

const SPEC_COLUMNS =
  "id, manual_id, evidence_page, kind, key, value, applies_to, version_ids, status, confidence, draft_note, reject_reason, verified_by, verified_at, created_at, updated_at";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function plain(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "That didn't work. Please try again.";
}

function intOrNull(value: unknown, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return { ok: false, error: `${label} must be a whole number greater than zero.` };
  }
  return { ok: true, value: n };
}

function pageDay(): string {
  return new Date().toISOString();
}

/** A whole number inside a range, or the error a person can read. */
function intBetween(
  value: unknown,
  label: string,
  min: number,
  max: number,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    return { ok: false, error: `${label} must be a whole number between ${min} and ${max}.` };
  }
  return { ok: true, value: n };
}

/** The page list the owner confirmed: whole numbers, no repeats, in order. Null when none was given. */
function parsePages(
  value: unknown,
  pageCount: number,
): { ok: true; pages: number[] | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, pages: null };
  if (!Array.isArray(value)) return { ok: false, error: "The pages must be a list of page numbers." };
  const pages: number[] = [];
  for (const item of value) {
    const n = Number(item);
    if (!Number.isInteger(n) || n < 1 || n > pageCount) {
      return { ok: false, error: `Page ${String(item)} is not a page of this PDF (${pageCount} pages).` };
    }
    if (!pages.includes(n)) pages.push(n);
  }
  if (!pages.length) return { ok: false, error: "Choose at least one page to read." };
  pages.sort((a, b) => a - b);
  return { ok: true, pages };
}

/** A printed date as YYYY-MM-DD, or the error a person can read. */
function parseDateOnly(value: unknown): { ok: true; date: string | null } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, date: null };
  const text = String(value).trim().slice(0, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { ok: false, error: "The printed date must read as YYYY-MM-DD, for example 2021-06-01." };
  }
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { ok: false, error: "That printed date is not a real date." };
  return { ok: true, date: text };
}

/** "2016–2020 · 2WD · 1.0 petrol" — a catalogue version in plain words (owner rule: no frame or engine codes). */
export function plainVersionLabel(row: Record<string, unknown>): string {
  const from = row.production_start_year == null ? null : Number(row.production_start_year);
  const to = row.production_end_year == null ? null : Number(row.production_end_year);
  const years = from ? (to ? `${from}–${to}` : `${from}–`) : "";
  const driveRaw = String(row.drivetrain ?? "").toUpperCase();
  const drive = driveRaw.match(/\b(2WD|4WD|AWD|FWD|RWD)\b/)?.[1] ?? "";
  const words = `${String(row.engine_type ?? "")} ${String(row.catalog_trim ?? "")} ${String(row.trim_series ?? "")}`;
  const turbo = /turbo|\bVET\b|-T\b|\bG-T\b/i.test(words);
  const size = row.engine_displacement_l ? Number(row.engine_displacement_l).toFixed(1) : "";
  const engine = size ? `${size} ${turbo ? "turbo" : "petrol"}` : turbo ? "turbo" : "";
  // One family holds several models (Roomy, Tank, Thor, Justy): the model name keeps two "2016–2020 · 2WD" apart.
  const model = String(row.model ?? "").trim();
  return [model, years, drive, engine].filter(Boolean).join(" · ") || "This version";
}

async function plainFamilyVersions(
  supabase: SupabaseClient,
  platformId: string,
): Promise<Array<{ id: string; label: string }>> {
  if (!isUuid(platformId)) return [];
  const { data: kids, error: kidError } = await supabase.from("vehicle_platform").select("id").eq("parent_id", platformId);
  if (kidError) throw kidError;
  const ids = [platformId, ...((kids ?? []) as Array<{ id: string }>).map((k) => String(k.id))];
  const { data, error } = await supabase
    .from("vehicle_catalog")
    .select("id, model, production_start_year, production_end_year, drivetrain, engine_type, catalog_trim, trim_series, engine_displacement_l")
    .in("platform_id", ids)
    .order("production_start_year", { ascending: true })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), label: plainVersionLabel(r) }));
}

/** The PDF page a row carries, as the page number printed on it. */
function withPrintedPage<T extends { evidence_page?: number | null }>(row: T, offset: number) {
  return {
    ...row,
    printed_page: row.evidence_page == null ? null : printedPageOrNull(Number(row.evidence_page), offset),
  };
}

/**
 * Every model family in the catalogue, with the years every version under it covers. One read, so identifying a
 * document does not walk the catalogue twice.
 */
async function loadCatalogueFamilies(
  supabase: SupabaseClient,
): Promise<Array<{
  platform_id: string;
  name: string;
  make: string | null;
  model: string | null;
  years: Array<{ from: number | null; to: number | null }>;
  label: string | null;
  cars: Array<{ make: string | null; model: string | null }>;
}>> {
  const { data: platforms, error: platformError } = await supabase
    .from("vehicle_platform")
    .select("id, code, maker, label, parent_id")
    .order("code", { ascending: true })
    .limit(5000);
  if (platformError) throw platformError;

  const rows = (platforms ?? []) as Array<{
    id: string;
    code: string | null;
    maker: string | null;
    label: string | null;
    parent_id: string | null;
  }>;

  const familyOf = new Map<string, string>();
  for (const row of rows) {
    if (!row.parent_id) familyOf.set(row.id, row.id);
  }
  for (const row of rows) {
    if (row.parent_id && familyOf.has(row.parent_id)) familyOf.set(row.id, row.parent_id);
  }

  const { data: cars, error: carError } = await supabase
    .from("vehicle_catalog")
    .select("platform_id, make, model, production_start_year, production_end_year")
    .not("platform_id", "is", null)
    .limit(5000);
  if (carError) throw carError;

  type Built = {
    platform_id: string;
    name: string;
    make: string | null;
    label: string | null;
    model: string | null;
    years: Array<{ from: number | null; to: number | null }>;
    models: Map<string, number>;
    cars: Map<string, { make: string | null; model: string | null }>;
  };

  const built = new Map<string, Built>();
  for (const row of rows) {
    const familyId = familyOf.get(row.id);
    if (!familyId || familyId !== row.id) continue;
    built.set(row.id, {
      platform_id: row.id,
      name: [row.maker?.toLowerCase() === "family" ? null : row.maker, row.label ?? row.code].filter(Boolean).join(" ").trim() || "Model family",
      make: row.maker,
      label: row.label ?? row.code,
      model: null,
      years: [],
      models: new Map(),
      cars: new Map(),
    });
  }

  for (const car of (cars ?? []) as Array<Record<string, unknown>>) {
    const familyId = familyOf.get(String(car.platform_id ?? ""));
    const family = familyId ? built.get(familyId) : null;
    if (!family) continue;
    family.years.push({
      from: car.production_start_year == null ? null : Number(car.production_start_year),
      to: car.production_end_year == null ? null : Number(car.production_end_year),
    });
    const model = String(car.model ?? "").trim();
    if (model) family.models.set(model, (family.models.get(model) ?? 0) + 1);
    const carMake = String(car.make ?? "").trim();
    if (model || carMake) family.cars.set(`${carMake}|${model}`, { make: carMake || null, model: model || null });
  }

  return [...built.values()].map((family) => {
    const best = [...family.models.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    // The platform row's own maker can be the word "family"; the make comes from the catalogue cars.
    const bestMake = (best ? [...family.cars.values()].find((car) => car.model === best[0])?.make : null) ??
      (family.make && family.make.toLowerCase() !== "family" ? family.make : null);
    return {
      platform_id: family.platform_id,
      name: best ? `${bestMake ?? ""} ${best[0]}`.trim() : family.name,
      make: bestMake,
      model: best ? best[0] : null,
      years: family.years,
      label: family.label,
      cars: [...family.cars.values()],
    };
  });
}

export function registerMaintenanceManualRoutes(route: RouteApp, supabase: SupabaseClient): void {
  // -------------------------------------------------------------------------
  // 0. Identify: what document is this? (DOC-01)
  // -------------------------------------------------------------------------
  route.post("/maintenance-manuals/identify", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;

    const apiKey = (Deno.env.get("DEEPSEEK_API_KEY") ?? "").trim();
    if (!apiKey) {
      return c.json({
        error: "The document reader is switched off on this server, so Roam cannot fill the form. Type it in.",
        code: "READER_OFF",
      }, 503);
    }

    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

      const fileName = String(body.file_name ?? "").trim().slice(0, 200) || "document.pdf";
      const pageCount = intOrNull(body.page_count, "The page count");
      if (!pageCount.ok) return c.json({ error: pageCount.error }, 400);
      if (pageCount.value == null) return c.json({ error: "The page count of the PDF is required." }, 400);

      // The browser sends the text of the first pages and the contents page; only pages that exist are kept.
      const rawPages = Array.isArray(body.pages_text) ? body.pages_text : [];
      const pages: IdentifyPageText[] = [];
      let budget = MAX_IDENTIFY_BODY_CHARS;
      for (const item of rawPages) {
        if (budget <= 0) break;
        const obj = (item ?? {}) as Record<string, unknown>;
        const pdfPage = Number(obj.pdf_page);
        if (!Number.isInteger(pdfPage) || pdfPage < 1 || pdfPage > pageCount.value) continue;
        const pageText = String(obj.text ?? "");
        if (!pageText.trim()) continue;
        const slice = pageText.slice(0, Math.min(6000, budget));
        budget -= slice.length;
        pages.push({ pdf_page: pdfPage, text: slice });
      }
      pages.sort((a, b) => a.pdf_page - b.pdf_page);

      // One short line per page (its running header), so the specs chapter at the back of a thick book is found.
      const pageHeads: IdentifyPageText[] = [];
      const seenHeads = new Set<number>();
      for (const item of Array.isArray(body.page_heads) ? body.page_heads : []) {
        const obj = (item ?? {}) as Record<string, unknown>;
        const pdfPage = Number(obj.pdf_page);
        if (!Number.isInteger(pdfPage) || pdfPage < 1 || pdfPage > pageCount.value || seenHeads.has(pdfPage)) continue;
        const head = String(obj.text ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
        if (!head) continue;
        seenHeads.add(pdfPage);
        pageHeads.push({ pdf_page: pdfPage, text: head });
        if (pageHeads.length >= 1500) break;
      }

      // A scanned document has no text layer; the browser sends the first page pictures instead.
      const images = (Array.isArray(body.page_images) ? body.page_images : [])
        .map((image) => String(image ?? ""))
        .filter((image) => image.length > 0)
        .slice(0, 6);

      if (!pages.length && !images.length) {
        return c.json({
          error: "Send the document's own text, or the first pages as pictures, so Roam can read it.",
        }, 400);
      }

      const reader = callDeepSeekIdentify(apiKey);
      const raw = await reader({
        fileName,
        pageCount: pageCount.value,
        pages,
        pageHeads,
        pageImages: images,
        imagesMimeType: String(body.page_images_type ?? "image/jpeg"),
      });

      // The page offset is counted from the printed page numbers when the book shows them; the reader's guess varies.
      const answer = withCountedOffset(parseIdentifyAnswer(raw, pageCount.value), pageHeads);

      // Which catalogue family this is, and the years the printed date covers.
      const families = await loadCatalogueFamilies(supabase);
      const match = matchCatalogueFamily(families, answer.make, answer.model);
      const years = chooseYears(answer.printed_date, match.family?.years ?? []);

      const pagesOut = answer.pages.map((page) => ({
        pdf_page: page.pdf_page,
        printed_page: page.printed_page,
        reason: page.reason,
      }));

      const unsure = Object.entries(answer.fields)
        .filter(([, field]) => !field.sure)
        .map(([field, value]) => ({ field, reason: value.reason || "Roam is not sure about this field." }));

      return c.json({
        make: answer.make,
        model: answer.model,
        title: answer.title,
        doc_type: answer.doc_type,
        market: answer.market,
        printed_date: answer.printed_date,
        page_offset: answer.page_offset,
        page_count: pageCount.value,
        pages: pagesOut,
        pages_to_read: pagesOut.length,
        family: match.family
          ? {
            platform_id: match.family.platform_id,
            name: match.family.name,
            make: match.family.make,
            model: match.family.model,
            years: match.family.years,
            close_names: match.closeNames,
          }
          : null,
        close_families: match.closeFamilies.map((f) => ({
          platform_id: f.platform_id,
          name: f.name,
          label: f.label ?? null,
          make: f.make,
          model: f.model,
          years: f.years,
        })),
        year_from: years.year_from,
        year_to: years.year_to,
        years_from_printed_date: years.fromPrintedDate,
        fields: answer.fields,
        unsure,
        message: match.family
          ? `Roam read this as ${match.family.name}, ${answer.doc_type === "owners_manual" ? "owner's manual" : "service schedule"}${pagesOut.length ? `, ${pagesOut.length} pages to read` : ""}. Check it before uploading.`
          : "Roam read the document but could not place the car in the catalogue. Choose the model family.",
      });
    } catch (err) {
      console.error("[maintenance-manuals] identify failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 1. Upload: a one-time PUT link to the private R2 bucket
  // -------------------------------------------------------------------------
  route.post("/maintenance-manuals/upload-url", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;

    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

      const platformId = String(body.platform_id ?? "").trim();
      if (!isUuid(platformId)) {
        return c.json({ error: "Choose the model family this manual is for." }, 400);
      }

      const market = String(body.market ?? "").trim().toUpperCase();
      if (!MARKETS.includes(market)) {
        return c.json({ error: "Choose the market: JM (Jamaica), GEN (export), JP (Japan) or OTHER." }, 400);
      }

      const title = String(body.title ?? "").trim().slice(0, MAX_TITLE);
      if (!title) {
        return c.json({ error: "Give the manual a title, for example \"Roomy 2018-2022 owner's manual\"." }, 400);
      }

      const fileSha = String(body.file_sha256 ?? "").trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(fileSha)) {
        return c.json({ error: "The file's SHA-256 (64 letters and numbers) is required." }, 400);
      }

      const pageCount = intOrNull(body.page_count, "The page count");
      if (!pageCount.ok) return c.json({ error: pageCount.error }, 400);
      if (pageCount.value == null) {
        return c.json({ error: "The page count is required." }, 400);
      }

      // The pages to read are a LIST (DOC-03). A caller that still sends one range gets the same answer as before.
      const pageList = parsePages(body.pages, pageCount.value);
      if (!pageList.ok) return c.json({ error: pageList.error }, 400);

      const pageFrom = intOrNull(body.page_from, "The first page of the maintenance table");
      if (!pageFrom.ok) return c.json({ error: pageFrom.error }, 400);
      const pageTo = intOrNull(body.page_to, "The last page of the maintenance table");
      if (!pageTo.ok) return c.json({ error: pageTo.error }, 400);

      let pages: number[];
      if (pageList.pages) {
        pages = pageList.pages;
      } else {
        if (pageFrom.value == null || pageTo.value == null) {
          return c.json({
            error: "Choose the pages to read, or the first and last page of the maintenance table.",
          }, 400);
        }
        if (pageFrom.value > pageTo.value) {
          return c.json({ error: "The first page of the table must not be after the last page." }, 400);
        }
        if (pageTo.value > pageCount.value) {
          return c.json({
            error: `The table cannot end on page ${pageTo.value} because the PDF has only ${pageCount.value} pages.`,
          }, 400);
        }
        pages = [];
        for (let p = pageFrom.value; p <= pageTo.value; p += 1) pages.push(p);
      }

      const docType = toDocType(body.doc_type) ?? "schedule";

      const pageOffsetInput = intBetween(body.page_offset, "The printed-page offset", -50, 50);
      if (!pageOffsetInput.ok) return c.json({ error: pageOffsetInput.error }, 400);
      const pageOffset = pageOffsetInput.value ?? 0;

      const yearFromInput = intBetween(body.year_from, "The first model year", 1900, 2100);
      if (!yearFromInput.ok) return c.json({ error: yearFromInput.error }, 400);
      const yearToInput = intBetween(body.year_to, "The last model year", 1900, 2100);
      if (!yearToInput.ok) return c.json({ error: yearToInput.error }, 400);
      if (yearFromInput.value == null && yearToInput.value != null) {
        return c.json({ error: "A last model year needs a first model year." }, 400);
      }
      if (yearFromInput.value != null && yearToInput.value != null && yearFromInput.value > yearToInput.value) {
        return c.json({ error: "The first model year must not be after the last model year." }, 400);
      }

      const printedDateInput = parseDateOnly(body.printed_date);
      if (!printedDateInput.ok) return c.json({ error: printedDateInput.error }, 400);

      const fileBytes = Number(body.file_bytes);
      if (!Number.isFinite(fileBytes) || fileBytes <= 0) {
        return c.json({ error: "The size of the file is required." }, 400);
      }
      if (fileBytes > MAX_MANUAL_BYTES) {
        return c.json({ error: "That file is bigger than 100 MB. Upload a smaller copy of the manual." }, 413);
      }

      if (!isManualStorageEnabled()) {
        return c.json({ error: manualStorageOffMessage(), code: "STORAGE_OFF" }, 503);
      }

      const { data: platform, error: platformError } = await supabase
        .from("vehicle_platform")
        .select("id, code, maker, label")
        .eq("id", platformId)
        .maybeSingle();
      if (platformError) throw platformError;
      if (!platform) {
        return c.json({ error: "That model family was not found." }, 404);
      }

      const id = crypto.randomUUID();
      const actor = catalogActorId(c);
      const { data: inserted, error: insertError } = await supabase
        .from("maintenance_manual")
        .insert({
          id,
          platform_id: platformId,
          market,
          title,
          file_key: manualFileKey(id),
          file_sha256: fileSha,
          page_count: pageCount.value,
          // The list is the truth; the trigger keeps page_from/page_to as its min and max.
          pages,
          page_from: pages[0],
          page_to: pages[pages.length - 1],
          doc_type: docType,
          page_offset: pageOffset,
          year_from: yearFromInput.value,
          year_to: yearToInput.value,
          printed_date: printedDateInput.date,
          status: "reading",
          progress_page: 0,
          uploaded_by: actor,
          uploaded_at: pageDay(),
        })
        .select(MANUAL_COLUMNS)
        .single();

      if (insertError) {
        if (String((insertError as { code?: string }).code ?? "") === "23505") {
          // Same file, same family. If the earlier upload never got its file through (the browser could not
          // send it, so no page was ever queued), reuse that row instead of blocking the owner forever.
          const { data: earlier, error: earlierError } = await supabase
            .from("maintenance_manual")
            .select("id, status")
            .eq("platform_id", platformId)
            .eq("file_sha256", fileSha)
            .maybeSingle();
          if (earlierError) throw earlierError;
          const earlierRow = earlier as { id: string; status: string } | null;
          if (earlierRow && earlierRow.status === "reading") {
            const { count: jobCount, error: jobError } = await supabase
              .from("maintenance_manual_page_job")
              .select("id", { count: "exact", head: true })
              .eq("manual_id", earlierRow.id);
            if (jobError) throw jobError;
            if ((jobCount ?? 0) === 0) {
              const { data: reused, error: reuseError } = await supabase
                .from("maintenance_manual")
                .update({
                  market,
                  title,
                  page_count: pageCount.value,
                  pages,
                  page_from: pages[0],
                  page_to: pages[pages.length - 1],
                  doc_type: docType,
                  page_offset: pageOffset,
                  year_from: yearFromInput.value,
                  year_to: yearToInput.value,
                  printed_date: printedDateInput.date,
                  progress_page: 0,
                  uploaded_by: actor,
                  uploaded_at: pageDay(),
                })
                .eq("id", earlierRow.id)
                .select(MANUAL_COLUMNS)
                .single();
              if (reuseError) throw reuseError;
              const reuseUrl = await presignManualUpload(earlierRow.id);
              return c.json({
                manual: reused,
                upload_url: reuseUrl,
                headers: { "content-type": "application/pdf" },
                expires_in_seconds: 600,
                reused_unfinished_upload: true,
              });
            }
          }
          return c.json({ error: "This exact file is already on file for this family." }, 409);
        }
        throw insertError;
      }

      let uploadUrl: string;
      try {
        uploadUrl = await presignManualUpload(id);
      } catch (err) {
        // No link means no usable row: take it back so the owner can try again cleanly.
        await supabase.from("maintenance_manual").delete().eq("id", id);
        throw err;
      }

      return c.json({
        manual: inserted,
        upload_url: uploadUrl,
        headers: { "content-type": "application/pdf" },
        expires_in_seconds: 600,
      });
    } catch (err) {
      console.error("[maintenance-manuals] upload-url failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Uploaded: check the file really is the PDF we were told about, then queue its pages
  // -------------------------------------------------------------------------
  route.post("/maintenance-manuals/:id/uploaded", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;

    const id = String(c.req.param("id") ?? "").trim();
    if (!isUuid(id)) return c.json({ error: "That manual was not found." }, 404);

    const stop = async (reason: string): Promise<Response> => {
      await supabase
        .from("maintenance_manual")
        .update({ status: "stopped", stop_reason: reason, updated_at: pageDay() })
        .eq("id", id);
      return c.json({ error: reason, code: "READ_STOPPED" }, 400) as unknown as Response;
    };

    try {
      const { data: manual, error: manualError } = await supabase
        .from("maintenance_manual")
        .select(MANUAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (manualError) throw manualError;
      if (!manual) return c.json({ error: "That manual was not found." }, 404);

      const row = manual as Record<string, unknown>;
      if (String(row.status) === "rejected") {
        return c.json({ error: "This manual was rejected, so its file is not read." }, 409);
      }

      if (!isManualStorageEnabled()) {
        return c.json({ error: manualStorageOffMessage(), code: "STORAGE_OFF" }, 503);
      }

      const key = String(row.file_key ?? "");
      let head: { size: number; contentType: string | null } | null = null;
      try {
        head = await headManualFile(key);
      } catch (err) {
        console.error("[maintenance-manuals] uploaded head failed", err);
        return c.json({ error: "The file could not be checked right now. Try again in a moment." }, 503);
      }
      if (!head) {
        return await stop("The file did not arrive. Upload it again.");
      }
      if (head.size <= 0) {
        return await stop("The uploaded file is empty. Upload it again.");
      }
      if (head.size > MAX_MANUAL_BYTES) {
        return await stop("That file is bigger than 100 MB. Upload a smaller copy of the manual.");
      }

      let bytes: Uint8Array;
      try {
        bytes = await readManualFile(key);
      } catch (err) {
        console.error("[maintenance-manuals] uploaded read failed", err);
        return c.json({ error: "The file could not be read right now. Try again in a moment." }, 503);
      }

      const magic = detectFileMagicBytes(bytes.subarray(0, Math.min(bytes.length, 32)));
      if (magic !== "application/pdf") {
        return await stop("That file is not a PDF. Upload the manual as a PDF file.");
      }

      const actualSha = await sha256OfBytes(bytes);
      if (actualSha.toLowerCase() !== String(row.file_sha256 ?? "").toLowerCase()) {
        return await stop("The file does not match the one you chose (the SHA-256 is different). Upload it again.");
      }

      let actualPages: number;
      try {
        actualPages = await countPdfPages(bytes);
      } catch (err) {
        return await stop(err instanceof PdfProblemError ? err.message : "This PDF could not be opened.");
      }
      const declared = Number(row.page_count ?? 0);
      if (actualPages !== declared) {
        return await stop(
          `The PDF has ${actualPages} page${actualPages === 1 ? "" : "s"} but ${declared} ${declared === 1 ? "was" : "were"} given. Check the page count and upload it again.`,
        );
      }

      // Exactly the listed pages: an owner's manual's useful pages are in several places, and reading the span
      // between them would queue a whole book (DOC-03).
      const listed = Array.isArray(row.pages)
        ? (row.pages as unknown[]).map((p) => Number(p)).filter((p) => Number.isInteger(p) && p >= 1)
        : [];
      let pageList: number[];
      if (listed.length) {
        pageList = [...new Set(listed)].sort((a, b) => a - b);
      } else {
        const from = Number(row.page_from ?? 1);
        const to = Number(row.page_to ?? from);
        pageList = [];
        for (let p = from; p <= to; p += 1) pageList.push(p);
      }

      const { data: queued, error: queueError } = await supabase.rpc("maintenance_manual_queue_pages", {
        p_manual_id: id,
        p_pages: pageList,
      });
      if (queueError) throw queueError;

      const { data: refreshed } = await supabase
        .from("maintenance_manual")
        .select(MANUAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      return c.json({
        manual: refreshed ?? manual,
        queued: Number(queued ?? pageList.length),
        message: `Reading ${pageList.length} page${pageList.length === 1 ? "" : "s"} in the background.`,
      });
    } catch (err) {
      console.error("[maintenance-manuals] uploaded failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // Car page (Vehicles): the car maker's tyres, battery, bulbs and fluids for one catalogue version (DOC-07/08/09)
  // -------------------------------------------------------------------------
  route.get("/maintenance-manuals/vehicle-specs/:vehicleCatalogId", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const carId = String(c.req.param("vehicleCatalogId") ?? "").trim();
    if (!isUuid(carId)) return c.json({ error: "That car version was not found." }, 404);
    try {
      const [tyres, bulbs, specs] = await Promise.all([
        supabase.from("vehicle_tyre").select("id, position, size, load_speed_index, wheel_size, pressure_kpa, is_optional, manual_id, evidence_page").eq("vehicle_catalog_id", carId).order("is_optional").order("position"),
        supabase.from("vehicle_bulb").select("id, position, bulb_ref, wattage_w, is_led, grade_note, manual_id, evidence_page").eq("vehicle_catalog_id", carId).order("position"),
        supabase.from("catalog_spec_value").select("spec_key, value, source_note, trust, trust_route").eq("vehicle_catalog_id", carId).eq("trust_route", "maker_document"),
      ]);
      for (const r of [tyres, bulbs, specs]) if (r.error) throw r.error;

      // Printed page numbers: look up each manual's offset once.
      const manualIds = [
        ...new Set(
          [...(tyres.data ?? []), ...(bulbs.data ?? [])]
            .map((r) => String((r as { manual_id?: string | null }).manual_id ?? ""))
            .filter(isUuid),
        ),
      ];
      const offsets = new Map<string, number>();
      if (manualIds.length) {
        const { data: manuals, error: mErr } = await supabase.from("maintenance_manual").select("id, page_offset").in("id", manualIds);
        if (mErr) throw mErr;
        for (const m of (manuals ?? []) as Array<{ id: string; page_offset: number | null }>) offsets.set(m.id, Number(m.page_offset ?? 0));
      }
      const printed = (r: { manual_id?: string | null; evidence_page?: number | null }) =>
        r.evidence_page == null ? null : printedPageOrNull(Number(r.evidence_page), offsets.get(String(r.manual_id ?? "")) ?? 0);

      const { data: keys } = await supabase.from("spec_key").select("key, label, unit");
      const labelOf = new Map(((keys ?? []) as Array<{ key: string; label: string; unit: string | null }>).map((k) => [k.key, k]));

      return c.json({
        tyres: ((tyres.data ?? []) as Array<Record<string, unknown>>).map((t) => ({ ...t, printed_page: printed(t) })),
        bulbs: ((bulbs.data ?? []) as Array<Record<string, unknown>>).map((b) => ({ ...b, printed_page: printed(b) })),
        specs: ((specs.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
          key: String(s.spec_key),
          label: labelOf.get(String(s.spec_key))?.label ?? String(s.spec_key),
          unit: labelOf.get(String(s.spec_key))?.unit ?? null,
          value: s.value,
          source_note: s.source_note ?? null,
        })),
      });
    } catch (err) {
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 3. The model list, with each family's manual state (Dominion data only)
  // -------------------------------------------------------------------------
  route.get("/maintenance-manuals", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;

    try {
      const platformId = String(c.req.query("platform_id") ?? "").trim();
      const hasManualRaw = String(c.req.query("has_manual") ?? "").trim().toLowerCase();
      const q = String(c.req.query("q") ?? "").trim();
      const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);

      const manualPlatformIds: string[] = [];
      if (hasManualRaw === "true" || hasManualRaw === "false") {
        const { data: manualRows, error: manualError } = await supabase
          .from("maintenance_manual")
          .select("platform_id");
        if (manualError) throw manualError;
        for (const row of (manualRows ?? []) as Array<Record<string, unknown>>) {
          const pid = String(row.platform_id ?? "");
          if (pid && !manualPlatformIds.includes(pid)) manualPlatformIds.push(pid);
        }
      }

      let query = supabase
        .from("vehicle_platform")
        .select("id, code, maker, label, parent_id", { count: "exact" })
        .is("parent_id", null)
        .order("code", { ascending: true });

      if (isUuid(platformId)) query = query.eq("id", platformId);
      if (q) {
        const like = q.replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim();
        if (like) {
          // People search by make and model ("Toyota Roomy"), so also find the families whose catalogue cars match.
          const words = like.split(" ").slice(0, 3);
          let carQuery = supabase.from("vehicle_catalog").select("platform_id").not("platform_id", "is", null).limit(400);
          for (const w of words) carQuery = carQuery.or(`make.ilike.%${w}%,model.ilike.%${w}%`);
          const { data: carHits, error: carHitError } = await carQuery;
          if (carHitError) throw carHitError;
          const hitPlatforms = [...new Set(((carHits ?? []) as Array<{ platform_id: string }>).map((r) => r.platform_id))];
          const familyIds = new Set<string>();
          if (hitPlatforms.length) {
            const { data: hitRows, error: hitRowError } = await supabase
              .from("vehicle_platform")
              .select("id, parent_id")
              .in("id", hitPlatforms);
            if (hitRowError) throw hitRowError;
            for (const p of (hitRows ?? []) as Array<{ id: string; parent_id: string | null }>) {
              familyIds.add(p.parent_id ?? p.id);
            }
          }
          const ors = [`code.ilike.%${like}%`, `maker.ilike.%${like}%`, `label.ilike.%${like}%`];
          if (familyIds.size) ors.push(`id.in.(${[...familyIds].join(",")})`);
          query = query.or(ors.join(","));
        }
      }
      if (hasManualRaw === "true") {
        if (!manualPlatformIds.length) return c.json({ items: [], page, page_size: PAGE_SIZE, total: 0 });
        query = query.in("id", manualPlatformIds);
      } else if (hasManualRaw === "false") {
        if (manualPlatformIds.length) query = query.not("id", "in", `(${manualPlatformIds.join(",")})`);
      }

      const from = (page - 1) * PAGE_SIZE;
      const { data: platforms, error: platformError, count } = await query.range(from, from + PAGE_SIZE - 1);
      if (platformError) throw platformError;

      const ids = ((platforms ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
      const manualsByPlatform = new Map<string, Array<Record<string, unknown>>>();
      if (ids.length) {
        const { data: manuals, error: manualError } = await supabase
          .from("maintenance_manual")
          .select(MANUAL_COLUMNS)
          .in("platform_id", ids)
          .order("created_at", { ascending: false });
        if (manualError) throw manualError;
        for (const manual of (manuals ?? []) as Array<Record<string, unknown>>) {
          const pid = String(manual.platform_id ?? "");
          const list = manualsByPlatform.get(pid) ?? [];
          list.push(manual);
          manualsByPlatform.set(pid, list);
        }
      }

      // Plain names for the screen: "Toyota Roomy 2016–2020", never the platform code (owner rule).
      const names = await familyNames(supabase, ids);

      const items = ((platforms ?? []) as Array<Record<string, unknown>>).map((platform) => {
        const pid = String(platform.id);
        const manuals = manualsByPlatform.get(pid) ?? [];
        const plainName = names.get(pid);
        return {
          platform_id: pid,
          code: String(platform.code ?? ""),
          maker: platform.maker == null ? null : String(platform.maker),
          label: platform.label == null ? null : String(platform.label),
          name: plainName?.name ?? null,
          also_sold_as: plainName?.also ?? [],
          catalogue_cars: plainName?.cars ?? 0,
          manual_status: manuals.length ? String(manuals[0].status ?? "") : "none",
          manuals: manuals.map((manual) => ({
            id: String(manual.id),
            market: String(manual.market ?? ""),
            title: String(manual.title ?? ""),
            status: String(manual.status ?? ""),
            page_from: Number(manual.page_from ?? 0),
            page_to: Number(manual.page_to ?? 0),
            page_count: Number(manual.page_count ?? 0),
            progress_page: manual.progress_page == null ? null : Number(manual.progress_page),
            created_at: manual.created_at ?? null,
          })),
        };
      });

      return c.json({ items, page, page_size: PAGE_SIZE, total: Number(count ?? items.length) });
    } catch (err) {
      console.error("[maintenance-manuals] list failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 4. One manual: progress, its pages, and the draft rows by page
  // -------------------------------------------------------------------------
  route.get("/maintenance-manuals/:id", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;

    const id = String(c.req.param("id") ?? "").trim();
    if (!isUuid(id)) return c.json({ error: "That manual was not found." }, 404);

    try {
      const { data: manual, error: manualError } = await supabase
        .from("maintenance_manual")
        .select(MANUAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (manualError) throw manualError;
      if (!manual) return c.json({ error: "That manual was not found." }, 404);

      const row = manual as Record<string, unknown>;
      const { data: platform } = await supabase
        .from("vehicle_platform")
        .select("id, code, maker, label")
        .eq("id", String(row.platform_id))
        .maybeSingle();

      const { data: pages, error: pagesError } = await supabase
        .from("maintenance_manual_page_job")
        .select("page_no, status, attempts, error, rows_found, finished_at")
        .eq("manual_id", id)
        .order("page_no", { ascending: true });
      if (pagesError) throw pagesError;

      const { data: drafts, error: draftsError } = await supabase
        .from("maintenance_task_templates")
        .select(DRAFT_COLUMNS)
        .eq("manual_id", id)
        .in("status", ["draft", "needs_checking", "active"])
        .order("evidence_page", { ascending: true });
      if (draftsError) throw draftsError;

      const draftRows = (drafts ?? []) as Array<Record<string, unknown>>;
      const componentIds = [
        ...new Set(draftRows.map((d) => String(d.component_id ?? "")).filter((v) => isUuid(v))),
      ];
      const namesById = new Map<string, string>();
      if (componentIds.length) {
        const { data: categories } = await supabase
          .from("maintenance_service_categories")
          .select("id, name")
          .in("id", componentIds);
        for (const category of (categories ?? []) as Array<Record<string, unknown>>) {
          namesById.set(String(category.id), String(category.name ?? ""));
        }
      }

      const pageRows = (pages ?? []) as Array<Record<string, unknown>>;
      const countBy = (status: string) => pageRows.filter((p) => String(p.status) === status).length;
      const offset = Number(row.page_offset ?? 0);
      // The family's catalogue versions in plain words, for the check screen's tick boxes (DOC-10). No codes.
      const versions = await plainFamilyVersions(supabase, String(row.platform_id ?? ""));
      const listedPages = Array.isArray(row.pages)
        ? (row.pages as unknown[]).map((p) => Number(p)).filter((p) => Number.isInteger(p) && p >= 1)
        : [];
      const pageFrom = Number(row.page_from ?? 1);
      const pageTo = Number(row.page_to ?? pageFrom);
      const pagesTotal = listedPages.length || Math.max(0, pageTo - pageFrom + 1);

      // The spec values this manual produced, each with the catalogue's current value per version, so the screen
      // can show "Now -> Manual" and "Matches" without a second call (DOC-12).
      const { data: specData, error: specError } = await supabase
        .from("maintenance_manual_spec_row")
        .select(SPEC_COLUMNS)
        .eq("manual_id", id)
        .in("status", ["draft", "active", "rejected"])
        .order("evidence_page", { ascending: true })
        .order("kind", { ascending: true });
      if (specError) throw specError;

      const { data: nowData, error: nowError } = await supabase.rpc("maintenance_manual_spec_current", {
        p_manual_id: id,
      });
      if (nowError) console.error("[maintenance-manuals] current values unreadable", nowError.message);

      const nowByKey = new Map<string, Array<{ vehicle_catalog_id: string; value: string }>>();
      for (const item of (nowData ?? []) as Array<Record<string, unknown>>) {
        const mapKey = `${String(item.kind)}:${String(item.spec_key)}`;
        const list = nowByKey.get(mapKey) ?? [];
        list.push({ vehicle_catalog_id: String(item.vehicle_catalog_id), value: String(item.now_value ?? "") });
        nowByKey.set(mapKey, list);
      }

      return c.json({
        manual: {
          ...row,
          // Every page a person sees is the printed page (DOC-04). The PDF page stays in the row itself.
          printed_pages: listedPages.map((p) => printedPageOrNull(p, offset)).filter((p) => p != null),
          pages_total: pagesTotal,
        },
        platform: platform ?? null,
        versions,
        progress: {
          page_from: pageFrom,
          page_to: pageTo,
          pages_total: pagesTotal,
          pages_done: countBy("done"),
          pages_failed: countBy("failed"),
          pages_pending: countBy("queued") + countBy("reading"),
          pages_skipped: countBy("skipped"),
          page: row.progress_page == null ? null : printedPageOrNull(Number(row.progress_page), offset),
        },
        pages: pageRows.map((p) => ({
          pdf_page: Number(p.page_no),
          printed_page: printedPageOrNull(Number(p.page_no), offset),
          status: String(p.status),
          attempts: Number(p.attempts ?? 0),
          error: p.error == null ? null : String(p.error),
          rows_found: p.rows_found == null ? null : Number(p.rows_found),
          finished_at: p.finished_at ?? null,
        })),
        rows: draftRows.map((d) => ({
          ...withPrintedPage(d, offset),
          part_name: d.component_id == null ? null : namesById.get(String(d.component_id)) ?? null,
          needs_checking: String(d.confidence ?? "") === "uncertain",
        })),
        specs: ((specData ?? []) as Array<Record<string, unknown>>).map((spec) => {
          const now = nowByKey.get(`${String(spec.kind)}:${String(spec.key)}`) ?? [];
          const ticked = Array.isArray(spec.version_ids) ? (spec.version_ids as unknown[]).map(String) : [];
          const nowForTicked = now.filter((n) => ticked.includes(n.vehicle_catalog_id));
          const rawValue = spec.value as Record<string, unknown> | null;
          const manualValue = rawValue && typeof rawValue === "object"
            ? String(rawValue.value ?? "")
            : String(spec.value ?? "");
          const matches = nowForTicked.length > 0 &&
            nowForTicked.every((n) => n.value.trim().toLowerCase() === manualValue.trim().toLowerCase());
          return { ...withPrintedPage(spec, offset), now, matches };
        }),
      });
    } catch (err) {
      console.error("[maintenance-manuals] detail failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 5. One page as a one-page PDF the screen draws (cut and cached on first ask)
  // -------------------------------------------------------------------------
  route.get("/maintenance-manuals/:id/pages/:n", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;

    const id = String(c.req.param("id") ?? "").trim();
    const pageNo = Number(c.req.param("n"));
    if (!isUuid(id)) return c.json({ error: "That manual was not found." }, 404);
    if (!Number.isInteger(pageNo) || pageNo < 1) return c.json({ error: "That page number is not valid." }, 400);

    try {
      const { data: manual, error: manualError } = await supabase
        .from("maintenance_manual")
        .select(MANUAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (manualError) throw manualError;
      if (!manual) return c.json({ error: "That manual was not found." }, 404);

      const row = manual as Record<string, unknown>;
      const from = Number(row.page_from ?? 1);
      const to = Number(row.page_to ?? from);
      if (pageNo < from || pageNo > to) {
        return c.json({ error: `This manual's maintenance table is pages ${from} to ${to}.` }, 404);
      }
      if (!isManualStorageEnabled()) {
        return c.json({ error: manualStorageOffMessage(), code: "STORAGE_OFF" }, 503);
      }

      const pageKey = manualPagePdfKey(id, pageNo);
      let cached = false;
      try {
        cached = (await headManualFile(pageKey)) != null;
      } catch {
        cached = false;
      }

      if (!cached) {
        const bytes = await readManualFile(String(row.file_key ?? ""));
        const pageBytes = await extractPdfPage(bytes, pageNo);
        await putManualPage(pageKey, pageBytes);
      }

      const url = await manualPageLink(id, pageNo);
      return c.json({
        page: pageNo,
        url,
        cached,
        expires_in_seconds: 900,
      });
    } catch (err) {
      if (err instanceof PdfProblemError) return c.json({ error: err.message }, 400);
      console.error("[maintenance-manuals] page failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 6. Edit one draft row
  // -------------------------------------------------------------------------
  route.patch("/maintenance-manual-rows/:ruleId", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;

    const ruleId = String(c.req.param("ruleId") ?? "").trim();
    if (!isUuid(ruleId)) return c.json({ error: "That row was not found." }, 404);

    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

      const { data: rule, error: ruleError } = await supabase
        .from("maintenance_task_templates")
        .select(DRAFT_COLUMNS)
        .eq("id", ruleId)
        .maybeSingle();
      if (ruleError) throw ruleError;
      if (!rule) return c.json({ error: "That row was not found." }, 404);

      const current = rule as Record<string, unknown>;
      if (current.manual_id == null) {
        return c.json({ error: "That row did not come from a manual." }, 400);
      }
      if (String(current.status) !== "draft") {
        return c.json({
          error: "This row is already approved, so it cannot be edited here. Retire it first if it is wrong.",
        }, 409);
      }

      const patch: Record<string, unknown> = { updated_at: pageDay() };
      const actor = catalogActorId(c);

      if (body.component_id !== undefined) {
        const componentId = body.component_id == null ? "" : String(body.component_id).trim();
        if (componentId && !isUuid(componentId)) {
          return c.json({ error: "Choose a part type from the list." }, 400);
        }
        if (componentId) {
          const { data: category } = await supabase
            .from("maintenance_service_categories")
            .select("id, kind")
            .eq("id", componentId)
            .maybeSingle();
          if (!category || String((category as Record<string, unknown>).kind) !== "component") {
            return c.json({ error: "That part type was not found." }, 400);
          }
        }
        patch.component_id = componentId || null;
        // The owner has answered the matching question, so the row no longer needs checking for it.
        patch.draft_note = null;
        patch.confidence = "likely";
      }

      for (const [key, label] of [
        ["interval_km", "The normal distance"],
        ["interval_months", "The normal months"],
        ["severe_interval_km", "The harder-driving distance"],
        ["severe_interval_months", "The harder-driving months"],
        ["first_interval_km", "The first-time distance"],
        ["first_interval_months", "The first-time months"],
      ] as const) {
        if (body[key] === undefined) continue;
        const parsed = intOrNull(body[key], label);
        if (!parsed.ok) return c.json({ error: parsed.error }, 400);
        patch[key] = parsed.value;
      }

      if (body.evidence_page !== undefined) {
        const parsed = intOrNull(body.evidence_page, "The page");
        if (!parsed.ok || parsed.value == null) {
          return c.json({ error: "The page must be a whole number greater than zero." }, 400);
        }
        patch.evidence_page = parsed.value;
      }

      if (body.severe_same_as_normal !== undefined) {
        const flag = body.severe_same_as_normal === true;
        patch.severe_same_as_normal = flag;
        if (flag) {
          // One figure means one figure: the severe columns stay empty.
          patch.severe_interval_km = null;
          patch.severe_interval_months = null;
        }
      }

      if (body.draft_note !== undefined && patch.draft_note === undefined) {
        const note = String(body.draft_note ?? "").trim();
        patch.draft_note = note ? note.slice(0, 300) : null;
      }

      patch.updated_by = actor;

      const { data: updated, error: updateError } = await supabase
        .from("maintenance_task_templates")
        .update(patch)
        .eq("id", ruleId)
        .select(DRAFT_COLUMNS)
        .single();
      if (updateError) throw updateError;

      return c.json({ row: updated });
    } catch (err) {
      console.error("[maintenance-manual-rows] patch failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 7. Approve drafts: they become the family's live rules and its cars update now
  // -------------------------------------------------------------------------
  route.post("/maintenance-manuals/:id/approve", requireAuth(), async (c: Context) => {
    const denied = assertCatalogGovernResponse(c);
    if (denied) return denied;

    const id = String(c.req.param("id") ?? "").trim();
    if (!isUuid(id)) return c.json({ error: "That manual was not found." }, 404);

    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const all = body.all === true;
      const ruleIdsRaw = body.rule_ids ?? body.ruleIds;
      const ruleIds = Array.isArray(ruleIdsRaw)
        ? ruleIdsRaw.map((v) => String(v)).filter((v) => isUuid(v))
        : null;

      if (!all && (!ruleIds || !ruleIds.length)) {
        return c.json({ error: "Choose the rows to approve, or send all: true to approve every certain row." }, 400);
      }

      const { data: manual } = await supabase
        .from("maintenance_manual")
        .select(MANUAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (!manual) return c.json({ error: "That manual was not found." }, 404);

      // "All" never approves a row that needs checking; it says how many it left.
      let skippedUncertain = 0;
      if (all) {
        const { data: uncertain, error: uncertainError } = await supabase
          .from("maintenance_task_templates")
          .select("id")
          .eq("manual_id", id)
          .eq("status", "draft")
          .eq("confidence", "uncertain");
        if (uncertainError) throw uncertainError;
        skippedUncertain = (uncertain ?? []).length;
      }

      const actor = catalogActorId(c);
      const { data: approved, error: approveError } = await supabase.rpc("maintenance_manual_approve", {
        p_manual_id: id,
        p_rule_ids: all ? null : ruleIds,
        p_actor: actor,
      });
      if (approveError) throw approveError;

      const rows = ((approved ?? []) as Array<Record<string, unknown>>).map((row) => ({
        rule_id: String(row.rule_id),
        component_id: row.component_id == null ? null : String(row.component_id),
        became_active: row.became_active === true,
      }));
      if (!rows.length) {
        return c.json({ error: "There is nothing on this manual to approve yet." }, 400);
      }

      const active = rows.filter((row) => row.became_active);
      const heldBack = rows.filter((row) => !row.became_active);

      // Every car of this family updates now (the existing recompute path), not tonight.
      let recomputedRules = 0;
      for (const row of active) {
        try {
          const { error: recomputeError } = await supabase.rpc("recompute_component_schedules_for_rule", {
            p_rule_id: row.rule_id,
          });
          if (recomputeError) console.error("[maintenance-manuals] recompute failed", recomputeError.message);
          else recomputedRules += 1;
        } catch (err) {
          console.error("[maintenance-manuals] recompute threw", err);
        }
      }

      const { data: refreshed } = await supabase
        .from("maintenance_manual")
        .select(MANUAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      const messages: string[] = [];
      messages.push(`${active.length} rule${active.length === 1 ? "" : "s"} now live.`);
      if (all && skippedUncertain) {
        messages.push(`${skippedUncertain} row${skippedUncertain === 1 ? "" : "s"} left for checking.`);
      }
      if (heldBack.length) {
        messages.push(`${heldBack.length} row${heldBack.length === 1 ? "" : "s"} had another rule at the same level and needs checking.`);
      }

      return c.json({
        approved: active.length,
        needs_checking: heldBack.length,
        skipped_uncertain: all ? skippedUncertain : 0,
        recomputed_rules: recomputedRules,
        rules: rows,
        manual: refreshed ?? manual,
        message: messages.join(" "),
      });
    } catch (err) {
      console.error("[maintenance-manuals] approve failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 8. Reject: its drafts are retired and the manual is closed with a reason
  // -------------------------------------------------------------------------
  route.post("/maintenance-manuals/:id/reject", requireAuth(), async (c: Context) => {
    const denied = assertCatalogGovernResponse(c);
    if (denied) return denied;

    const id = String(c.req.param("id") ?? "").trim();
    if (!isUuid(id)) return c.json({ error: "That manual was not found." }, 404);

    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const reason = String(body.reason ?? "").trim().slice(0, MAX_REASON);
      if (reason.length < 10) {
        return c.json({ error: "Give a reason of at least 10 characters, so the next person knows why." }, 400);
      }

      const actor = catalogActorId(c);
      const { data: retired, error } = await supabase.rpc("maintenance_manual_reject", {
        p_manual_id: id,
        p_reason: reason,
        p_actor: actor,
      });
      if (error) {
        const message = plain(error);
        if (/reason of at least 10 characters/i.test(message)) return c.json({ error: message }, 400);
        if (/not found/i.test(message)) return c.json({ error: "That manual was not found." }, 404);
        throw error;
      }

      const { data: refreshed } = await supabase
        .from("maintenance_manual")
        .select(MANUAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      return c.json({
        retired: Number(retired ?? 0),
        manual: refreshed ?? null,
        message: `Manual rejected. ${Number(retired ?? 0)} draft row${Number(retired ?? 0) === 1 ? "" : "s"} retired.`,
      });
    } catch (err) {
      console.error("[maintenance-manuals] reject failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 9. Stop: pages not started are skipped; the rows read so far are kept
  // -------------------------------------------------------------------------
  route.post("/maintenance-manuals/:id/stop", requireAuth(), async (c: Context) => {
    const denied = assertCatalogGovernResponse(c);
    if (denied) return denied;

    const id = String(c.req.param("id") ?? "").trim();
    if (!isUuid(id)) return c.json({ error: "That manual was not found." }, 404);

    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const reason = String(body.reason ?? "").trim().slice(0, MAX_REASON) || "Stopped by the owner.";
      const actor = catalogActorId(c);

      const { data: skipped, error } = await supabase.rpc("maintenance_manual_stop", {
        p_manual_id: id,
        p_reason: reason,
        p_actor: actor,
      });
      if (error) {
        const message = plain(error);
        if (/not found/i.test(message)) return c.json({ error: "That manual was not found." }, 404);
        throw error;
      }

      const { data: refreshed } = await supabase
        .from("maintenance_manual")
        .select(MANUAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      return c.json({
        skipped: Number(skipped ?? 0),
        manual: refreshed ?? null,
        message: `Reading stopped. ${Number(skipped ?? 0)} page${Number(skipped ?? 0) === 1 ? "" : "s"} skipped; the rows already read are kept.`,
      });
    } catch (err) {
      console.error("[maintenance-manuals] stop failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 10. Read chosen pages again (their drafts are replaced; approved rules stay)
  // -------------------------------------------------------------------------
  route.post("/maintenance-manuals/:id/reread", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;

    const id = String(c.req.param("id") ?? "").trim();
    if (!isUuid(id)) return c.json({ error: "That manual was not found." }, 404);

    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const raw = body.pages ?? body.page_numbers ?? body.pageNumbers;
      const pages = Array.isArray(raw)
        ? raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
        : [];
      if (!pages.length) {
        return c.json({ error: "Choose the pages to read again." }, 400);
      }

      const { data: manual } = await supabase
        .from("maintenance_manual")
        .select(MANUAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (!manual) return c.json({ error: "That manual was not found." }, 404);

      const row = manual as Record<string, unknown>;
      if (String(row.status) === "rejected") {
        return c.json({ error: "This manual was rejected. Upload it again to read it." }, 409);
      }

      const from = Number(row.page_from ?? 1);
      const to = Number(row.page_to ?? from);
      const outside = pages.filter((p) => p < from || p > to);
      if (outside.length) {
        return c.json({
          error: `Page${outside.length === 1 ? "" : "s"} ${outside.join(", ")} ${outside.length === 1 ? "is" : "are"} outside the maintenance table (pages ${from} to ${to}).`,
        }, 400);
      }

      const { data: queued, error } = await supabase.rpc("maintenance_manual_queue_pages", {
        p_manual_id: id,
        p_pages: [...new Set(pages)].sort((a, b) => a - b),
      });
      if (error) {
        const message = plain(error);
        if (/outside/i.test(message)) return c.json({ error: message }, 400);
        if (/not found/i.test(message)) return c.json({ error: "That manual was not found." }, 404);
        throw error;
      }

      const { data: refreshed } = await supabase
        .from("maintenance_manual")
        .select(MANUAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      return c.json({
        queued: Number(queued ?? pages.length),
        manual: refreshed ?? null,
        message: `Reading ${pages.length} page${pages.length === 1 ? "" : "s"} again in the background.`,
      });
    } catch (err) {
      console.error("[maintenance-manuals] reread failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 11. One spec value on the check screen: edit it while it is still a draft
  // -------------------------------------------------------------------------
  route.patch("/maintenance-manual-spec-rows/:specId", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;

    const specId = String(c.req.param("specId") ?? "").trim();
    if (!isUuid(specId)) return c.json({ error: "That value was not found." }, 404);

    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

      const { data: spec, error: specError } = await supabase
        .from("maintenance_manual_spec_row")
        .select(SPEC_COLUMNS)
        .eq("id", specId)
        .maybeSingle();
      if (specError) throw specError;
      if (!spec) return c.json({ error: "That value was not found." }, 404);

      const current = spec as Record<string, unknown>;
      if (String(current.status) !== "draft") {
        return c.json({
          error: "This value is already approved, so it cannot be edited here.",
        }, 409);
      }

      const patch: Record<string, unknown> = { updated_at: pageDay() };

      if (body.value !== undefined) {
        if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
          return c.json({ error: "The value must be an object, for example {\"value\": 2.9, \"unit\": \"L\"}." }, 400);
        }
        patch.value = body.value;
      }

      if (body.applies_to !== undefined) {
        const note = String(body.applies_to ?? "").trim().slice(0, 80);
        patch.applies_to = note || null;
      }

      if (body.evidence_page !== undefined) {
        const page = intOrNull(body.evidence_page, "The page");
        if (!page.ok) return c.json({ error: page.error }, 400);
        if (page.value == null) return c.json({ error: "The page must be a whole number greater than zero." }, 400);
        patch.evidence_page = page.value;
      }

      if (body.version_ids !== undefined) {
        const raw = Array.isArray(body.version_ids) ? body.version_ids : [];
        const ids = raw.map((v) => String(v)).filter((v) => isUuid(v));
        if (!ids.length) {
          return c.json({ error: "Tick at least one version this value applies to." }, 400);
        }
        patch.version_ids = ids;
      }

      if (body.draft_note !== undefined) {
        const note = String(body.draft_note ?? "").trim().slice(0, 300);
        patch.draft_note = note || null;
      }

      const { data: updated, error: updateError } = await supabase
        .from("maintenance_manual_spec_row")
        .update(patch)
        .eq("id", specId)
        .select(SPEC_COLUMNS)
        .single();
      if (updateError) throw updateError;

      return c.json({ spec: updated });
    } catch (err) {
      console.error("[maintenance-manual-spec-rows] patch failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 12. Approve one spec value: it reaches the ticked versions only, and is logged (DOC-10, DOC-12)
  // -------------------------------------------------------------------------
  route.post("/maintenance-manual-spec-rows/:specId/approve", requireAuth(), async (c: Context) => {
    const denied = assertCatalogGovernResponse(c);
    if (denied) return denied;

    const specId = String(c.req.param("specId") ?? "").trim();
    if (!isUuid(specId)) return c.json({ error: "That value was not found." }, 404);

    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const raw = body.version_ids ?? body.versionIds;
      const versionIds = Array.isArray(raw) ? raw.map((v) => String(v)).filter((v) => isUuid(v)) : null;
      if (versionIds && !versionIds.length) {
        return c.json({ error: "Tick at least one version this value applies to." }, 400);
      }

      const actor = catalogActorId(c);
      const { data: written, error } = await supabase.rpc("maintenance_manual_spec_approve", {
        p_spec_id: specId,
        p_version_ids: versionIds,
        p_actor: actor,
      });
      if (error) {
        const message = plain(error);
        if (/not found/i.test(message)) return c.json({ error: "That value was not found." }, 404);
        if (/choose at least one version|not one of this manual|already (active|rejected)|is empty/i.test(message)) {
          return c.json({ error: message }, 400);
        }
        throw error;
      }

      const rows = ((written ?? []) as Array<Record<string, unknown>>).map((row) => ({
        vehicle_catalog_id: String(row.written_version_id ?? ""),
        target: String(row.target_table ?? ""),
        old_value: row.old_value == null ? null : String(row.old_value),
        new_value: row.new_value == null ? null : String(row.new_value),
        changed: row.changed === true,
      }));
      if (!rows.length) {
        return c.json({ error: "Nothing was written: tick the versions this value applies to." }, 400);
      }

      const changed = rows.filter((row) => row.changed).length;
      const { data: refreshed } = await supabase
        .from("maintenance_manual_spec_row")
        .select(SPEC_COLUMNS)
        .eq("id", specId)
        .maybeSingle();

      return c.json({
        approved: rows.length,
        changed,
        written: rows,
        spec: refreshed ?? null,
        message: `Written to ${rows.length} version${rows.length === 1 ? "" : "s"}; ${changed} value${changed === 1 ? " was" : "s were"} different from what Roam held.`,
      });
    } catch (err) {
      console.error("[maintenance-manual-spec-rows] approve failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 13. Approve every certain spec of a manual; rows that need a person stay (DOC-06)
  // -------------------------------------------------------------------------
  route.post("/maintenance-manuals/:id/approve-specs", requireAuth(), async (c: Context) => {
    const denied = assertCatalogGovernResponse(c);
    if (denied) return denied;

    const id = String(c.req.param("id") ?? "").trim();
    if (!isUuid(id)) return c.json({ error: "That manual was not found." }, 404);

    try {
      const { data: manual } = await supabase
        .from("maintenance_manual")
        .select("id, title")
        .eq("id", id)
        .maybeSingle();
      if (!manual) return c.json({ error: "That manual was not found." }, 404);

      const { data: drafts, error: draftError } = await supabase
        .from("maintenance_manual_spec_row")
        .select("id, confidence, version_ids")
        .eq("manual_id", id)
        .eq("status", "draft");
      if (draftError) throw draftError;

      const all = (drafts ?? []) as Array<Record<string, unknown>>;
      const ready = all.filter(
        (row) =>
          String(row.confidence ?? "") !== "uncertain" &&
          Array.isArray(row.version_ids) &&
          (row.version_ids as unknown[]).length > 0,
      );
      const skipped = all.length - ready.length;

      if (!ready.length) {
        return c.json({
          approved: 0,
          skipped_unsure: skipped,
          message: skipped
            ? `${skipped} value${skipped === 1 ? "" : "s"} need${skipped === 1 ? "s" : ""} a person; nothing was approved.`
            : "There are no values to approve on this manual yet.",
        }, 200);
      }

      const actor = catalogActorId(c);
      let approved = 0;
      const failures: string[] = [];
      for (const row of ready) {
        const { error } = await supabase.rpc("maintenance_manual_spec_approve", {
          p_spec_id: String(row.id),
          p_version_ids: row.version_ids as string[],
          p_actor: actor,
        });
        if (error) failures.push(plain(error));
        else approved += 1;
      }

      const messages = [`${approved} value${approved === 1 ? "" : "s"} written.`];
      if (skipped) messages.push(`${skipped} left for a person.`);
      if (failures.length) messages.push(`${failures.length} could not be written: ${failures[0]}`);

      return c.json({
        approved,
        skipped_unsure: skipped,
        failures: failures.slice(0, 5),
        message: messages.join(" "),
      });
    } catch (err) {
      console.error("[maintenance-manuals] approve-specs failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // 14. Reject one spec value, with a reason a person can read
  // -------------------------------------------------------------------------
  route.post("/maintenance-manual-spec-rows/:specId/reject", requireAuth(), async (c: Context) => {
    const denied = assertCatalogGovernResponse(c);
    if (denied) return denied;

    const specId = String(c.req.param("specId") ?? "").trim();
    if (!isUuid(specId)) return c.json({ error: "That value was not found." }, 404);

    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const reason = String(body.reason ?? "").trim().slice(0, MAX_REASON);
      if (reason.length < 10) {
        return c.json({ error: "Give a reason of at least 10 characters, so the next person knows why." }, 400);
      }

      const actor = catalogActorId(c);
      const { error } = await supabase.rpc("maintenance_manual_spec_reject", {
        p_spec_id: specId,
        p_reason: reason,
        p_actor: actor,
      });
      if (error) {
        const message = plain(error);
        if (/not found/i.test(message)) return c.json({ error: "That value was not found." }, 404);
        if (/at least 10 characters|no longer a draft/i.test(message)) return c.json({ error: message }, 400);
        throw error;
      }

      const { data: refreshed } = await supabase
        .from("maintenance_manual_spec_row")
        .select(SPEC_COLUMNS)
        .eq("id", specId)
        .maybeSingle();

      return c.json({ spec: refreshed ?? null, message: "Value rejected." });
    } catch (err) {
      console.error("[maintenance-manual-spec-rows] reject failed", err);
      return c.json({ error: plain(err) }, 500);
    }
  });
}