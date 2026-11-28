/**
 * Step 6b — the page worker after a manual knows what kind of document it is.
 *
 * Two things are proved here:
 *  1. a maintenance sheet's rows really reach the page writer — the reader answers `{ raw, reader }`, and the
 *     parser must be handed `raw`. No earlier test looked at the rows a page wrote, so this one does.
 *  2. an owner's manual page writes spec values (with the versions pre-ticked from the page's remark) and, when
 *     the page also prints an interval, its draft rule — while a maintenance sheet still writes only rules.
 *
 * deno test --no-check supabase/functions/_fleet-server/maintenance_manual_worker_specs.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import type { DraftRuleRow } from "./maintenance_manual_draft.ts";
import type {
  DraftSpecRow,
  ManualJobDb,
  ManualRow,
  PageJobRow,
} from "./maintenance_manual_job_db.ts";
import type { CategoryRow } from "./maintenance_manual_match.ts";
import type { ManualReaderName } from "./maintenance_manual_settings.ts";
import type { SpecVersion } from "./maintenance_manual_specs_prompt.ts";
import { runMaintenanceManualWorker } from "./maintenance_manual_worker.ts";

const MANUAL_ID = "f1000000-0000-4000-8000-000000000001";
const PLATFORM_ID = "f1000000-0000-4000-8000-000000000002";

const VERSIONS: SpecVersion[] = [
  { id: "f1000000-0000-4000-8000-00000000000a", label: "2016–2020 · 2WD", drivetrain: "2WD" },
  { id: "f1000000-0000-4000-8000-00000000000b", label: "2016–2020 · 4WD", drivetrain: "4WD" },
];

const CATEGORIES: CategoryRow[] = [
  { id: "cat-oil", name: "Engine oil & filter", code: "oil" },
  { id: "cat-rotate", name: "Tyre rotation", code: "rotate_tires" },
];

function manualRow(over: Partial<ManualRow> = {}): ManualRow {
  return {
    id: MANUAL_ID,
    platform_id: PLATFORM_ID,
    market: "JP",
    title: "Step 6b manual",
    file_key: `maintenance-manuals/${MANUAL_ID}.pdf`,
    file_sha256: "a".repeat(64),
    page_count: 40,
    page_from: 1,
    page_to: 2,
    pages: [1, 2],
    doc_type: "schedule",
    page_offset: 0,
    year_from: 2020,
    year_to: null,
    printed_date: "2021-06-01",
    status: "reading",
    progress_page: 0,
    reject_reason: null,
    stop_reason: null,
    ...over,
  };
}

function pageJob(pageNo: number): PageJobRow {
  return {
    id: `job-${pageNo}`,
    manual_id: MANUAL_ID,
    page_no: pageNo,
    status: "queued",
    attempts: 0,
    error: null,
    rows_found: null,
    reader: null,
    lease_until: null,
    next_attempt_at: null,
    started_at: null,
    finished_at: null,
  };
}

class FakeDb implements ManualJobDb {
  rules: Array<{ pageNo: number; rows: DraftRuleRow[] }> = [];
  specs: Array<{ pageNo: number; rows: DraftSpecRow[] }> = [];
  finished: Array<{ status: string; rows: number | null; reader: string | null }> = [];
  versionsAsked = 0;
  private queue: PageJobRow[];
  private manual: ManualRow | null;

  constructor(pageNumbers: number[], manual: ManualRow | null) {
    this.queue = pageNumbers.map(pageJob);
    this.manual = manual;
  }

  async tryAcquireWorkerLease() {
    return true;
  }
  async releaseWorkerLease() {}
  async claimPages(limit: number) {
    return this.queue.splice(0, limit).map((page) => ({ ...page, status: "reading" as const }));
  }
  async sweepStuck() {
    return 0;
  }
  async incrementAttempts() {
    return 1;
  }
  async requeue() {}
  async requeueGiveBack() {}
  async finishPage(
    _jobId: string,
    status: "done" | "failed" | "skipped",
    rowsFound: number | null,
    _error: string | null,
    reader?: ManualReaderName | null,
  ) {
    this.finished.push({ status, rows: rowsFound, reader: reader ?? null });
  }
  async loadManual() {
    return this.manual;
  }
  async replacePageDrafts(_manualId: string, pageNo: number, rows: DraftRuleRow[]) {
    this.rules.push({ pageNo, rows });
    return rows.length;
  }
  async replacePageSpecs(_manualId: string, pageNo: number, rows: DraftSpecRow[]) {
    this.specs.push({ pageNo, rows });
    return rows.length;
  }
  async loadCategories() {
    return CATEGORIES;
  }
  async loadVersions() {
    this.versionsAsked += 1;
    return VERSIONS;
  }
}

/** A real (if empty) PDF, because the worker cuts a page out of the manual's own file. */
const PAGE_BYTES = await (async () => {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= 3; i += 1) doc.addPage([420, 595]);
  return await doc.save();
})();

function deps(db: FakeDb, readPage: () => Promise<{ raw: unknown; reader: ManualReaderName }>) {
  return {
    now: () => new Date("2026-11-27T12:00:00Z"),
    jobDb: db,
    store: {
      read: async () => PAGE_BYTES,
      put: async () => {},
    },
    readPage,
    checkGuards: async () => {},
    model: "unused",
  };
}

const SHEET_ANSWER = {
  rows: [
    {
      part: "Engine oil",
      applies_to: "Except turbo",
      normal_km: 15000,
      normal_months: 12,
      severe_km: 7500,
      one_figure: false,
      confidence: "high",
    },
  ],
};

Deno.test("a maintenance sheet page writes its rules (the raw answer is what is parsed)", async () => {
  const db = new FakeDb([1], manualRow());
  const result = await runMaintenanceManualWorker(
    deps(db, async () => ({ raw: SHEET_ANSWER, reader: "deepseek" })),
  );

  assertEquals(result.pagesRead, 1);
  assertEquals(db.rules.length, 1);
  assertEquals(db.rules[0].rows.length, 1);
  assertEquals(db.rules[0].rows[0].interval_km, 15000);
  assertEquals(db.specs.length, 0);
  assertEquals(db.finished[0].rows, 1);
  assertEquals(db.finished[0].reader, "deepseek");
});

const SPECS_ANSWER = {
  specs: [
    { kind: "fuel", key: "fuel_tank_capacity", value: { value: 38, unit: "L" }, applies_to: "4WD" },
    { kind: "tyre", key: "front", value: { size: "165/65R14", pressure_kpa: 260 } },
  ],
  intervals: [
    { part: "Tyre rotation", normal_km: 5000, one_figure: true, confidence: "high" },
  ],
};

Deno.test("an owner's-manual page writes spec values with their versions, and any interval it prints", async () => {
  const db = new FakeDb([1], manualRow({ doc_type: "owners_manual", page_offset: 4 }));
  const result = await runMaintenanceManualWorker(
    deps(db, async () => ({ raw: SPECS_ANSWER, reader: "deepseek" })),
  );

  assertEquals(result.pagesRead, 1);
  assertEquals(db.specs.length, 1);
  assertEquals(db.specs[0].rows.length, 2);

  const tank = db.specs[0].rows.find((row) => row.key === "fuel_tank_capacity")!;
  // The page says 4WD, so only the 4WD version is pre-ticked.
  assertEquals(tank.appliesTo, "4WD");
  assertEquals(tank.version_ids, ["f1000000-0000-4000-8000-00000000000b"]);

  const tyre = db.specs[0].rows.find((row) => row.key === "front")!;
  // No remark: every version of the family.
  assertEquals(tyre.version_ids.length, 2);

  // The interval the page also prints is a draft rule, read by the interval parser.
  assertEquals(db.rules.length, 1);
  assertEquals(db.rules[0].rows[0].interval_km, 5000);

  assertEquals(db.finished[0].rows, 3);
  assertEquals(db.versionsAsked, 1);
});

Deno.test("the versions are read once for the whole run, not once per page", async () => {
  const db = new FakeDb([1, 2], manualRow({ doc_type: "owners_manual", pages: [1, 2] }));
  await runMaintenanceManualWorker(
    deps(db, async () => ({ raw: SPECS_ANSWER, reader: "deepseek" })),
  );
  assertEquals(db.specs.length, 2);
  assertEquals(db.versionsAsked, 1);
});
