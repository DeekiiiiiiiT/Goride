/**
 * Step 3 — the manual page worker: one page per job, a few pages per run, inside a time budget well under the
 * edge limit (the saved-page upload once hit a 504, which is why the read runs as a job at all).
 *
 * Honours the shared Gemini guards (kill switch and monthly / daily budget). A paused or out-of-budget run
 * waits: the page goes back to the queue with its attempt given back, and is never marked failed for it.
 */
import { checkProviderGuards, ProviderBlockedError } from "./api_usage_logger.ts";
import { cleanLastError } from "../_shared/vehiclePictures/lastError.ts";
import { buildDraftRows } from "./maintenance_manual_draft.ts";
import type { ManualJobDb, ManualRow, PageJobRow } from "./maintenance_manual_job_db.ts";
import type { CategoryRow } from "./maintenance_manual_match.ts";
import { extractPdfPage, PdfProblemError } from "./maintenance_manual_pdf.ts";
import { buildManualPagePrompt, parseManualPage } from "./maintenance_manual_prompt.ts";
import type { ManualReaderName } from "./maintenance_manual_settings.ts";
import {
  buildSpecDraftRows,
  versionsInYears,
  buildSpecsPagePrompt,
  parseSpecsPage,
  type SpecVersion,
} from "./maintenance_manual_specs_prompt.ts";
import { MANUAL_BUCKET, manualPagePdfKey } from "./maintenance_manual_storage.ts";

/** The R2 surface the worker uses (R2Client satisfies it; tests pass a fake). */
export type ManualObjectStore = {
  read(bucket: "private", key: string): Promise<Uint8Array>;
  put(
    bucket: "private",
    key: string,
    bytes: Uint8Array,
    contentType: string,
    cacheControl: string,
  ): Promise<void>;
};

/** What one page read is given. */
export type ManualPageReadInput = {
  model: string;
  prompt: string;
  pdfBytes: Uint8Array;
  pageNo: number;
};

/** Which reader produced the rows (recorded on the page job), and the model's raw JSON. */
export type ManualPageRead = { raw: unknown; reader: ManualReaderName };

/** One read of one page. Returns the model's raw JSON (parsed by `parseManualPage`) and the reader's name. */
export type ManualPageReader = (input: ManualPageReadInput) => Promise<ManualPageRead>;

export type ManualWorkerDeps = {
  now: () => Date;
  jobDb: ManualJobDb;
  store: ManualObjectStore | null;
  readPage: ManualPageReader;
  /** Shared Gemini guards: kill switch, monthly / daily budget. */
  checkGuards?: () => Promise<void>;
  model: string;
  budgetMs?: number;
  minPageTimeMs?: number;
  maxPerRound?: number;
  maxAttempts?: number;
};

export type ManualWorkerResult = {
  skipped: boolean;
  pagesRead: number;
  pagesFailed: number;
  rowsWritten: number;
  /** Plain reason the run stopped early (paused / budget / time), for the route's answer. */
  stopped: string | null;
};

/** The whole run stays inside this, and the edge call has time left to answer. */
export const MANUAL_RUN_BUDGET_MS = 90_000;
/** A page read can take up to 45 s, so a page is only started with this much of the budget left. */
export const MANUAL_MIN_PAGE_TIME_MS = 50_000;
const WORKER_LEASE_SECONDS = 120;
const PAGE_LEASE_SECONDS = 180;
const MAX_PER_ROUND = 3;
const BUDGET_RETRY_MS = 60 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 3;
const PAGE_CACHE_CONTROL = "private, no-store";

type PageOutcome = { read: boolean; failed: boolean; rows: number; stopRun: boolean; stopped?: string };

export async function runMaintenanceManualWorker(deps: ManualWorkerDeps): Promise<ManualWorkerResult> {
  const runId = crypto.randomUUID();
  const started = deps.now().getTime();
  const budget = deps.budgetMs ?? MANUAL_RUN_BUDGET_MS;
  const minPageTime = deps.minPageTimeMs ?? MANUAL_MIN_PAGE_TIME_MS;
  const maxPerRound = deps.maxPerRound ?? MAX_PER_ROUND;
  const checkGuards = deps.checkGuards ?? (() => checkProviderGuards("gemini"));

  const heldUntil = new Date(started + WORKER_LEASE_SECONDS * 1000).toISOString();
  const got = await deps.jobDb.tryAcquireWorkerLease(runId, heldUntil);
  if (!got) {
    return { skipped: true, pagesRead: 0, pagesFailed: 0, rowsWritten: 0, stopped: null };
  }

  let pagesRead = 0;
  let pagesFailed = 0;
  let rowsWritten = 0;
  let stopped: string | null = null;

  try {
    await deps.jobDb.sweepStuck();

    try {
      await checkGuards();
    } catch (err) {
      if (err instanceof ProviderBlockedError) {
        return { skipped: false, pagesRead: 0, pagesFailed: 0, rowsWritten: 0, stopped: "budget" };
      }
      throw err;
    }

    const manuals = new Map<string, ManualRow | null>();
    const manualBytes = new Map<string, Uint8Array>();
    const categories: { rows: CategoryRow[] } = { rows: [] };
    const versions = new Map<string, SpecVersion[]>();

    while (deps.now().getTime() - started < budget) {
      const pages = await deps.jobDb.claimPages(maxPerRound, PAGE_LEASE_SECONDS);
      if (!pages.length) break;

      let stop = false;
      let outOfTime = false;

      for (const page of pages) {
        const left = budget - (deps.now().getTime() - started);
        if (stop || outOfTime || left < minPageTime) {
          if (left < minPageTime) outOfTime = true;
          // Nothing was sent to the model, so the attempt is given straight back.
          await deps.jobDb.requeue(page.id, deps.now().toISOString());
          continue;
        }

        const outcome = await processPage(deps, page, { manuals, manualBytes, categories, versions });
        if (outcome.read) pagesRead += 1;
        if (outcome.failed) pagesFailed += 1;
        rowsWritten += outcome.rows;
        if (outcome.stopRun) {
          stop = true;
          stopped = outcome.stopped ?? stopped;
        }
      }

      if (outOfTime && !stopped) stopped = "time";
      if (stop || outOfTime) break;
      if (deps.now().getTime() - started >= budget) break;
    }

    return { skipped: false, pagesRead, pagesFailed, rowsWritten, stopped };
  } finally {
    await deps.jobDb.releaseWorkerLease(runId).catch(() => {});
  }
}

async function processPage(
  deps: ManualWorkerDeps,
  page: PageJobRow,
  cache: {
    manuals: Map<string, ManualRow | null>;
    manualBytes: Map<string, Uint8Array>;
    categories: { rows: CategoryRow[] };
    versions: Map<string, SpecVersion[]>;
  },
): Promise<PageOutcome> {
  const now = deps.now();

  if (!cache.manuals.has(page.manual_id)) {
    cache.manuals.set(page.manual_id, await deps.jobDb.loadManual(page.manual_id));
  }
  const manual = cache.manuals.get(page.manual_id) ?? null;
  if (!manual) {
    await deps.jobDb.finishPage(page.id, "failed", null, "This manual is no longer on file.");
    return { read: false, failed: true, rows: 0, stopRun: false };
  }
  if (manual.status === "stopped" || manual.status === "rejected") {
    await deps.jobDb.finishPage(page.id, "skipped", null, null);
    return { read: false, failed: false, rows: 0, stopRun: false };
  }
  if (!deps.store) {
    await deps.jobDb.requeueGiveBack(page.id, new Date(now.getTime() + BUDGET_RETRY_MS).toISOString());
    return { read: false, failed: false, rows: 0, stopRun: true, stopped: "storage" };
  }

  // The manual is read once per run, so ten pages of one manual cost one download.
  let bytes = cache.manualBytes.get(manual.id);
  if (!bytes) {
    try {
      bytes = await deps.store.read(MANUAL_BUCKET, manual.file_key);
      cache.manualBytes.set(manual.id, bytes);
    } catch (err) {
      console.error("[maintenance-manual-worker] manual unreadable", err);
      await deps.jobDb.requeueGiveBack(page.id, new Date(now.getTime() + BUDGET_RETRY_MS).toISOString());
      return { read: false, failed: false, rows: 0, stopRun: false };
    }
  }

  let pagePdf: Uint8Array;
  try {
    pagePdf = await extractPdfPage(bytes, page.page_no);
  } catch (err) {
    // The page cannot be cut out, so reading it again will not help.
    const reason = err instanceof PdfProblemError
      ? err.message
      : "This page could not be taken out of the PDF.";
    await deps.jobDb.finishPage(page.id, "failed", null, reason);
    return { read: false, failed: true, rows: 0, stopRun: false };
  }

  // Cache the one-page PDF the screen draws. Best effort: a failure here must not lose the read.
  try {
    await deps.store.put(
      MANUAL_BUCKET,
      manualPagePdfKey(manual.id, page.page_no),
      pagePdf,
      "application/pdf",
      PAGE_CACHE_CONTROL,
    );
  } catch (err) {
    console.error("[maintenance-manual-worker] page cache failed", err);
  }

  if (!cache.categories.rows.length) {
    try {
      cache.categories.rows = await deps.jobDb.loadCategories();
    } catch (err) {
      console.error("[maintenance-manual-worker] part types unreadable", err);
      await deps.jobDb.requeueGiveBack(page.id, new Date(now.getTime() + BUDGET_RETRY_MS).toISOString());
      return { read: false, failed: false, rows: 0, stopRun: false };
    }
  }

  const attemptsAfter = await deps.jobDb.incrementAttempts(page.id);
  // An owner's manual is read for the car's values; a maintenance sheet for its intervals.
  const isOwnersManual = manual.doc_type === "owners_manual";
  const prompt = isOwnersManual
    ? buildSpecsPagePrompt({
      pageNo: page.page_no,
      manualTitle: manual.title,
      market: manual.market,
    })
    : buildManualPagePrompt({
      pageNo: page.page_no,
      manualTitle: manual.title,
      market: manual.market,
    });

  try {
    // `readPage` answers with the model's raw JSON and the name of the reader that produced it.
    const read = await deps.readPage({
      model: deps.model,
      prompt,
      pdfBytes: pagePdf,
      pageNo: page.page_no,
    });

    if (isOwnersManual) {
      const parsed = parseSpecsPage(read.raw);

      // An owner's manual page may also print an interval (tyre rotation, cabin filter): those are the same
      // draft rules a maintenance sheet produces, read by the same parser.
      const built = buildDraftRows({
        manualId: manual.id,
        pageNo: page.page_no,
        parsed: parsed.intervals,
        categories: cache.categories.rows,
      });
      const writtenRules = await deps.jobDb.replacePageDrafts(manual.id, page.page_no, built.rows);

      if (!cache.versions.has(manual.platform_id)) {
        cache.versions.set(manual.platform_id, await deps.jobDb.loadVersions(manual.platform_id));
      }
      const specRows = buildSpecDraftRows({
        parsed: parsed.rows,
        // Only the versions the document's years cover are pre-ticked; the owner can tick more.
        versions: versionsInYears(cache.versions.get(manual.platform_id) ?? [], manual.year_from, manual.year_to),
      });
      const writtenSpecs = await deps.jobDb.replacePageSpecs(manual.id, page.page_no, specRows);

      const total = writtenRules + writtenSpecs;
      await deps.jobDb.finishPage(page.id, "done", total, null, read.reader);
      return { read: true, failed: false, rows: total, stopRun: false };
    }

    const parsed = parseManualPage(read.raw);
    const built = buildDraftRows({
      manualId: manual.id,
      pageNo: page.page_no,
      parsed: parsed.rows,
      categories: cache.categories.rows,
    });

    const written = await deps.jobDb.replacePageDrafts(manual.id, page.page_no, built.rows);
    await deps.jobDb.finishPage(page.id, "done", written, null, read.reader);
    return { read: true, failed: false, rows: written, stopRun: false };
  } catch (err) {
    if (err instanceof ProviderBlockedError) {
      await deps.jobDb.requeueGiveBack(page.id, new Date(deps.now().getTime() + BUDGET_RETRY_MS).toISOString());
      return { read: false, failed: false, rows: 0, stopRun: true, stopped: "budget" };
    }

    const max = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const message = cleanLastError(err instanceof Error ? err.message : "The page could not be read");
    if (attemptsAfter >= max) {
      await deps.jobDb.finishPage(page.id, "failed", null, message);
      return { read: false, failed: true, rows: 0, stopRun: false };
    }
    const backoffMs = Math.pow(2, attemptsAfter) * 60_000;
    await deps.jobDb.requeue(page.id, new Date(deps.now().getTime() + backoffMs).toISOString());
    return { read: false, failed: false, rows: 0, stopRun: false };
  }
}
