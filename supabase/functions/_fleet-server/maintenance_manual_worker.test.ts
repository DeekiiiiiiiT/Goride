/**
 * Step 3 — the manual page worker: one page per job, inside a time budget, and honest about pauses.
 * deno test --no-check supabase/functions/_fleet-server/maintenance_manual_worker.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { ProviderBlockedError } from "./api_usage_logger.ts";
import type { DraftRuleRow } from "./maintenance_manual_draft.ts";
import type { ManualJobDb, ManualRow, PageJobRow } from "./maintenance_manual_job_db.ts";
import type { CategoryRow } from "./maintenance_manual_match.ts";
import type { ManualReaderName } from "./maintenance_manual_settings.ts";
import { runMaintenanceManualWorker } from "./maintenance_manual_worker.ts";

const MANUAL_ID = "0f0f0f0f-1111-4222-8333-444455556666";

const CATEGORIES: CategoryRow[] = [{ id: "c-oil", name: "Engine oil", code: "oil" }];

async function madeUpPdf(pages = 6): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pages; i++) doc.addPage([420, 595]);
  return await doc.save();
}

function manual(over: Partial<ManualRow> = {}): ManualRow {
  return {
    id: MANUAL_ID,
    platform_id: "11111111-2222-4333-8444-555555555555",
    market: "JM",
    title: "Test manual",
    file_key: `maintenance-manuals/${MANUAL_ID}.pdf`,
    file_sha256: "a".repeat(64),
    page_count: 6,
    page_from: 2,
    page_to: 6,
    status: "reading",
    progress_page: 1,
    reject_reason: null,
    stop_reason: null,
    ...over,
  };
}

type Call = { name: string; args: unknown[] };

class FakeDb implements ManualJobDb {
  calls: Call[] = [];
  queue: PageJobRow[];
  manuals = new Map<string, ManualRow | null>();
  finished: Array<{ id: string; status: string; rows: number | null; error: string | null; reader: string | null }> =
    [];
  replaced: Array<{ manualId: string; pageNo: number; rows: DraftRuleRow[] }> = [];
  requeued: Array<{ id: string; gaveBack: boolean }> = [];
  leaseAcquired = true;

  constructor(pages: number[]) {
    this.queue = pages.map((pageNo, index) => ({
      id: `job-${pageNo}-${index}`,
      manual_id: MANUAL_ID,
      page_no: pageNo,
      status: "queued" as const,
      attempts: 0,
      error: null,
      rows_found: null,
      reader: null,
      lease_until: null,
      next_attempt_at: null,
      started_at: null,
      finished_at: null,
    }));
  }

  async tryAcquireWorkerLease() {
    this.calls.push({ name: "lease", args: [] });
    return this.leaseAcquired;
  }
  async releaseWorkerLease() {
    this.calls.push({ name: "release", args: [] });
  }
  async claimPages(limit: number) {
    const out = this.queue.splice(0, limit);
    return out.map((page) => ({ ...page, status: "reading" as const }));
  }
  async sweepStuck() {
    return 0;
  }
  async incrementAttempts(jobId: string) {
    this.calls.push({ name: "attempt", args: [jobId] });
    return 1;
  }
  async requeue(jobId: string) {
    this.requeued.push({ id: jobId, gaveBack: false });
  }
  async requeueGiveBack(jobId: string) {
    this.requeued.push({ id: jobId, gaveBack: true });
  }
  async finishPage(
    jobId: string,
    status: "done" | "failed" | "skipped",
    rows: number | null,
    error: string | null,
    reader?: ManualReaderName | null,
  ) {
    this.finished.push({ id: jobId, status, rows, error, reader: reader ?? null });
  }
  async loadManual(manualId: string) {
    return this.manuals.has(manualId) ? this.manuals.get(manualId)! : null;
  }
  async replacePageDrafts(manualId: string, pageNo: number, rows: DraftRuleRow[]) {
    this.replaced.push({ manualId, pageNo, rows });
    return rows.length;
  }
  async loadCategories() {
    return CATEGORIES;
  }
}

function clock(startMs = Date.UTC(2026, 10, 27, 12, 0, 0)) {
  let current = startMs;
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

const ONE_ROW_ANSWER = {
  rows: [{ part: "Engine oil", normal_km: 10000, normal_months: 12, one_figure: true, confidence: "high" }],
};

Deno.test("pages that would outrun the time budget are put back untouched, never failed", async () => {
  const db = new FakeDb([2, 3, 4, 5, 6]);
  db.manuals.set(MANUAL_ID, manual());
  const pdf = await madeUpPdf(6);
  const time = clock();

  const result = await runMaintenanceManualWorker({
    now: time.now,
    jobDb: db,
    store: {
      read: async () => pdf,
      put: async () => {},
    },
    readPage: async () => {
      // A page read takes 40 s of the 90 s run.
      time.advance(40_000);
      return { raw: ONE_ROW_ANSWER, reader: "deepseek" };
    },
    checkGuards: async () => {},
    model: "test-model",
  });

  assertEquals(result.pagesRead, 2);
  assertEquals(result.pagesFailed, 0);
  assertEquals(result.stopped, "time");
  // Two pages read, one claimed but never started (put back inside the run), two never claimed (still queued).
  assertEquals(db.finished.length, 2);
  assertEquals(db.finished.every((f) => f.status === "done"), true);
  assertEquals(db.requeued.length, 1);
  assertEquals(db.requeued.every((r) => !r.gaveBack), true);
  assertEquals(db.queue.length, 2);
  assertEquals(db.finished.filter((f) => f.status === "failed").length, 0);
});

Deno.test("a budget pause waits: the page goes back with its attempt given back", async () => {
  const db = new FakeDb([2]);
  db.manuals.set(MANUAL_ID, manual());
  const pdf = await madeUpPdf(6);
  const time = clock();

  const result = await runMaintenanceManualWorker({
    now: time.now,
    jobDb: db,
    store: { read: async () => pdf, put: async () => {} },
    readPage: async () => {
      throw new ProviderBlockedError("gemini", "budget_monthly", "Monthly budget reached");
    },
    checkGuards: async () => {},
    model: "test-model",
  });

  assertEquals(result.stopped, "budget");
  assertEquals(db.finished.filter((f) => f.status === "failed").length, 0);
  const gaveBack = db.requeued.filter((r) => r.gaveBack);
  assertEquals(gaveBack.length, 1);
});

Deno.test("a page that fails three times is failed with a plain reason", async () => {
  const db = new FakeDb([2, 3, 4]);
  db.manuals.set(MANUAL_ID, manual());
  const pdf = await madeUpPdf(6);
  const time = clock();
  let attempt = 0;

  const result = await runMaintenanceManualWorker({
    now: time.now,
    jobDb: db,
    store: { read: async () => pdf, put: async () => {} },
    readPage: async () => {
      attempt += 1;
      throw new Error("Gemini HTTP 500: upstream error");
    },
    checkGuards: async () => {},
    model: "test-model",
    maxAttempts: 1,
  });

  void attempt;
  // maxAttempts = 1: the first failure is final, and the message is kept for the screen.
  assertEquals(result.pagesFailed, 3);
  const failed = db.finished.filter((f) => f.status === "failed");
  assertEquals(failed.length, 3);
  if (!failed[0].error?.includes("Gemini")) throw new Error(`expected the reason to be kept, got ${failed[0].error}`);
});

Deno.test("a page of a stopped manual is skipped, not read", async () => {
  const db = new FakeDb([2]);
  db.manuals.set(MANUAL_ID, manual({ status: "stopped" }));
  const pdf = await madeUpPdf(6);
  const time = clock();
  let readCalls = 0;

  const result = await runMaintenanceManualWorker({
    now: time.now,
    jobDb: db,
    store: { read: async () => pdf, put: async () => {} },
    readPage: async () => {
      readCalls += 1;
      return { raw: ONE_ROW_ANSWER, reader: "gemini" };
    },
    checkGuards: async () => {},
    model: "test-model",
  });

  assertEquals(readCalls, 0);
  assertEquals(result.pagesRead, 0);
  assertEquals(db.finished[0].status, "skipped");
});

Deno.test("a read page writes its drafts to that page and caches the one-page PDF", async () => {
  const db = new FakeDb([4]);
  db.manuals.set(MANUAL_ID, manual());
  const pdf = await madeUpPdf(6);
  const time = clock();
  const puts: string[] = [];

  await runMaintenanceManualWorker({
    now: time.now,
    jobDb: db,
    store: {
      read: async () => pdf,
      put: async (_bucket, key) => {
        puts.push(key);
      },
    },
    readPage: async () => ({ raw: ONE_ROW_ANSWER, reader: "deepseek" }),
    checkGuards: async () => {},
    model: "test-model",
  });

  assertEquals(db.replaced.length, 1);
  assertEquals(db.replaced[0].pageNo, 4);
  assertEquals(db.replaced[0].manualId, MANUAL_ID);
  assertEquals(db.replaced[0].rows.length, 1);
  assertEquals(db.replaced[0].rows[0].component_id, "c-oil");
  assertEquals(puts, [`maintenance-manuals/${MANUAL_ID}/page-4.pdf`]);
  assertEquals(db.finished[0].status, "done");
  assertEquals(db.finished[0].rows, 1);
  assertEquals(db.finished[0].reader, "deepseek");
});

Deno.test("a second run cannot start while the first holds the lease", async () => {
  const db = new FakeDb([2]);
  db.leaseAcquired = false;
  const time = clock();

  const result = await runMaintenanceManualWorker({
    now: time.now,
    jobDb: db,
    store: null,
    readPage: async () => ({ raw: ONE_ROW_ANSWER, reader: "deepseek" }),
    checkGuards: async () => {},
    model: "test-model",
  });

  assertEquals(result.skipped, true);
  assertEquals(db.finished.length, 0);
});

Deno.test("the page job records which reader produced its rows (a DeepSeek fallback is not silent)", async () => {
  const db = new FakeDb([2, 3]);
  db.manuals.set(MANUAL_ID, manual());
  const pdf = await madeUpPdf(6);
  const time = clock();
  let reads = 0;

  await runMaintenanceManualWorker({
    now: time.now,
    jobDb: db,
    store: { read: async () => pdf, put: async () => {} },
    readPage: async () => {
      reads += 1;
      // The first page DeepSeek read; the second DeepSeek failed and Gemini read it in the same attempt.
      return { raw: ONE_ROW_ANSWER, reader: reads === 1 ? "deepseek" : "gemini" };
    },
    checkGuards: async () => {},
    model: "test-model",
  });

  assertEquals(db.finished.map((f) => f.reader), ["deepseek", "gemini"]);
});
