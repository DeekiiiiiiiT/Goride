/**
 * M4/M5 migration scripts — rules that must not drift from the deployed storage code.
 *
 * deno test --no-check --allow-env --allow-read scripts/r2-migration.test.ts
 * (also listed in CI's "Deno test R2 object storage" step)
 *
 * The link signer and the SigV4 signer are plain .mjs ports of the TypeScript modules, so the
 * tests below sign the SAME input with both implementations and require identical output.
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  R2_PRIVATE_BUCKET,
  contentTypeFor,
  isSafeObjectKey,
  keyForOldObject,
} from "./r2-migration/keys.mjs";
import {
  FILE_LINK_SECONDS,
  makeFileLinkSigner,
  signFileLink,
} from "./r2-migration/fileLinkSigner.mjs";
import { signRequest as signRequestJs } from "./r2-migration/sigv4.mjs";
import {
  manifestIndex,
  newAddressFor,
  parseBareObjectPath,
  parseOldReference,
  rewriteStringsDeep,
  shortenLink,
} from "./r2-migration/references.mjs";
import { findOldReferences, isLedgerKvKey, isLedgerTable, parseOpenApiTables, pickPrimaryKey } from "./r2-migration/discovery.mjs";
import { buildCopyPlan, shouldSkipExisting, summarizePlan } from "./r2-migration/plan.mjs";
import {
  partitionUpdates,
  planEvidenceRewrites,
  planFleetRewrites,
  planKvRewrites,
  planPartsRewrites,
  planTableRewrites,
  summarizeRewrites,
  updateFreshKey,
} from "./r2-migration/rewrite.mjs";
import {
  buildFleetInventorySql,
  buildFleetRewriteSql,
  copiedPathPattern,
  md5Hex,
  summarizeFleetRows,
} from "./r2-migration/fleet.mjs";
import { countManifest } from "./r2-migration/manifest.mjs";
import { FILE_LINK_SECONDS as TS_FILE_LINK_SECONDS, signFileLink as tsSignFileLink, verifyFileLink } from "../supabase/functions/_shared/objectStorage/fileLink.ts";
import { signRequest as signRequestTs } from "../supabase/functions/_shared/objectStorage/sigv4.ts";

const SECRET = "test-file-link-secret";
const BASE = "https://csfllzzastacofsvcdsc.supabase.co";
const NOW = 1_800_000_000;
const SIGN = (key: string) => `LINK:${key}`;

const EVIDENCE_URL =
  `${BASE}/storage/v1/object/sign/ephemeral-evidence/org-a/fuel_receipt/u1.jpg?token=abcdef123456789`;

function manifest(entries: Array<Record<string, unknown>>) {
  return manifestIndex(
    entries.map((entry) => ({ bucket: "ephemeral-evidence", size: 10, ok: true, ...entry })),
  );
}

// ---------------------------------------------------------------- key mapping (M4)

Deno.test("key mapping: the three real buckets map deterministically", () => {
  assertEquals(keyForOldObject("ephemeral-evidence", "org-a/fuel_receipt/u1.jpg"), {
    key: "evidence/org-a/fuel_receipt/u1.jpg",
    skip: null,
    reason: null,
  });
  assertEquals(keyForOldObject("make-37f42386-docs", "org-a/driver-docs/u2.pdf"), {
    key: "fleet-docs/legacy/org-a/driver-docs/u2.pdf",
    skip: null,
    reason: null,
  });
  assertEquals(keyForOldObject("parts-imports", "batch-1/source.csv"), {
    key: "parts-imports/platform/batch-1/source.csv",
    skip: null,
    reason: null,
  });
});

Deno.test("key mapping: placeholder, unknown bucket and unsafe paths are never copied", () => {
  assertEquals(keyForOldObject("ephemeral-evidence", "org/.emptyFolderPlaceholder").skip, "placeholder");
  assertEquals(keyForOldObject("merchant-assets", "a/b.png").skip, "unknown_bucket");
  const unsafe = keyForOldObject("ephemeral-evidence", "org-a/fuel receipt/u 1.jpg");
  assertEquals(unsafe.key, null);
  assertEquals(unsafe.skip, "unsafe");
  assert(isSafeObjectKey("evidence/org-a/fuel_receipt/u1.jpg"));
  assert(!isSafeObjectKey("../escape"));
});

Deno.test("key mapping: an unexpected parts-imports shape is kept, with a warning", () => {
  const mapped = keyForOldObject("parts-imports", "batch-1/other.csv");
  assertEquals(mapped.key, "parts-imports/legacy/batch-1/other.csv");
  assert(mapped.reason?.includes("unexpected"));
});

Deno.test("key mapping: content type keeps what Supabase reported, else uses the extension", () => {
  assertEquals(contentTypeFor("a/b.pdf", "application/pdf"), "application/pdf");
  assertEquals(contentTypeFor("a/b.csv", "application/octet-stream"), "text/csv; charset=utf-8");
  assertEquals(contentTypeFor("a/b.jpeg", ""), "image/jpeg");
  assertEquals(R2_PRIVATE_BUCKET, "roam-private");
});

// ---------------------------------------------------------------- copy plan (M4)

Deno.test("copy plan: deleted evidence and placeholders are skipped, totals add up", () => {
  const entries = buildCopyPlan({
    objects: [
      { bucket: "ephemeral-evidence", path: "o/fuel_receipt/live.jpg", size: 100 },
      { bucket: "ephemeral-evidence", path: "o/fuel_receipt/gone.jpg", size: 200 },
      { bucket: "ephemeral-evidence", path: "o/.emptyFolderPlaceholder", size: 0 },
      { bucket: "parts-imports", path: "b1/source.csv", size: 30 },
    ],
    evidenceStatusByPath: new Map([
      ["o/fuel_receipt/live.jpg", "active"],
      ["o/fuel_receipt/gone.jpg", "deleted"],
    ]),
  });
  assertEquals(entries.map((e) => e.skip), [null, "deleted", "placeholder", null]);
  const totals = summarizePlan(entries);
  assertEquals(totals.get("ephemeral-evidence").listed, 3);
  assertEquals(totals.get("ephemeral-evidence").toCopy, 1);
  assertEquals(totals.get("ephemeral-evidence").skippedDeleted, 1);
  assertEquals(totals.get("ephemeral-evidence").skippedPlaceholder, 1);
  assertEquals(totals.get("parts-imports").toCopy, 1);
});

Deno.test("copy plan: an object already in R2 with the same size is skipped on re-run", () => {
  assert(shouldSkipExisting({ size: 100, contentType: "image/jpeg" }, 100));
  assert(!shouldSkipExisting({ size: 99, contentType: "image/jpeg" }, 100));
  assert(!shouldSkipExisting(null, 100));
});

// ---------------------------------------------------------------- link signer (M5)

Deno.test("link signer: the .mjs link verifies with verifyFileLink() from fileLink.ts", async () => {
  const key = "evidence/org-a/fuel_receipt/u1.jpg";
  const url = signFileLink({ key, secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW });
  const params = new URL(url).searchParams;
  assertEquals(params.get("b"), "private");
  assertEquals(params.get("k"), key);
  assertEquals(params.get("e"), String(NOW + FILE_LINK_SECONDS));
  assertEquals(await verifyFileLink(params, SECRET, NOW + 10), { ok: true, key });
});

Deno.test("link signer: identical output to signFileLink() in fileLink.ts, same secret and clock", async () => {
  const key = "fleet-docs/legacy/org-a/driver-docs/u2.pdf";
  const ported = signFileLink({ key, secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW });
  const original = await tsSignFileLink({ key, secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW });
  assertEquals(ported, original);
  assertEquals(FILE_LINK_SECONDS, TS_FILE_LINK_SECONDS);
});

Deno.test("link signer: a tampered or expired link is refused by verifyFileLink()", async () => {
  const key = "evidence/org-a/fuel_receipt/u1.jpg";
  const url = signFileLink({ key, secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW, seconds: 60 });
  const expired = new URL(url).searchParams;
  assertEquals(await verifyFileLink(expired, SECRET, NOW + 61), { ok: false, reason: "expired" });

  const tampered = new URL(url).searchParams;
  tampered.set("k", "evidence/org-b/fuel_receipt/u1.jpg");
  assertEquals(await verifyFileLink(tampered, SECRET, NOW), { ok: false, reason: "bad_signature" });

  await assertThrows(() => signFileLink({ key: "../x", secret: SECRET, supabaseUrl: BASE }));
});

Deno.test("link signer: the signer bound to one clock is deterministic", () => {
  const sign = makeFileLinkSigner({ secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW });
  assertEquals(sign("evidence/a/b/c.jpg"), sign("evidence/a/b/c.jpg"));
  assert(sign("evidence/a/b/c.jpg").includes("s="));
});

// ---------------------------------------------------------------- SigV4 port

Deno.test("sigv4: the .mjs PUT signature matches sigv4.ts byte for byte", async () => {
  const creds = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "auto" };
  const url = "https://abc123.r2.cloudflarestorage.com/roam-private/evidence/org-a/fuel_receipt/u1.jpg";
  const now = new Date("2026-11-25T03:44:00Z");
  const opts = {
    creds,
    method: "PUT",
    url,
    headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" },
    payloadHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    now,
  };
  assertEquals(signRequestJs(opts), await signRequestTs(opts));
});

// ---------------------------------------------------------------- reference parsing / replacement

Deno.test("references: all old address forms parse, new ones do not", () => {
  assertEquals(parseOldReference(EVIDENCE_URL), {
    bucket: "ephemeral-evidence",
    path: "org-a/fuel_receipt/u1.jpg",
    form: "sign",
  });
  assertEquals(
    parseOldReference(`${BASE}/storage/v1/object/public/make-37f42386-docs/org-a/driver-docs/u2.pdf`),
    { bucket: "make-37f42386-docs", path: "org-a/driver-docs/u2.pdf", form: "public" },
  );
  assertEquals(parseOldReference("parts-imports/b1/source.csv"), {
    bucket: "parts-imports",
    path: "b1/source.csv",
    form: "bucket_path",
  });
  assertEquals(parseOldReference("https://example.com/storage/v1/object/sign/merchant-assets/a.png"), null);
  assertEquals(parseOldReference(signFileLink({ key: "evidence/a/b.jpg", secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW })), null);
  assertEquals(parseBareObjectPath("b1/source.csv"), "b1/source.csv");
  assertEquals(parseBareObjectPath("https://x/y"), null);
});

Deno.test("references: a KV record keeps every address, nested and in arrays", () => {
  const doc = {
    id: "t1",
    receiptUrl: EVIDENCE_URL,
    metadata: { invoiceUrl: `${BASE}/storage/v1/object/sign/make-37f42386-docs/o/d/u.pdf?token=z` },
    documents: [{ url: "parts-imports/b1/source.csv" }, { url: "unrelated" }],
  };
  const found = findOldReferences(doc);
  assertEquals(found.map((ref) => ref.pointer), ["receiptUrl", "metadata.invoiceUrl", "documents[0].url"]);
  assertEquals(found.map((ref) => ref.bucket), [
    "ephemeral-evidence",
    "make-37f42386-docs",
    "parts-imports",
  ]);
});

Deno.test("rewrite: every string the manifest knows is replaced, others are untouched", () => {
  const index = manifest([
    { bucket: "ephemeral-evidence", path: "org-a/fuel_receipt/u1.jpg", key: "evidence/org-a/fuel_receipt/u1.jpg" },
  ]);
  const { value, edits } = rewriteStringsDeep({ a: EVIDENCE_URL, b: "keep me" }, (text) => {
    const ref = parseOldReference(text);
    const entry = ref ? index.get(`${ref.bucket}\u0000${ref.path}`) : null;
    return entry ? newAddressFor(entry, SIGN) : null;
  });
  assertEquals(edits.length, 1);
  assertEquals((value as { a: string }).a, "LINK:evidence/org-a/fuel_receipt/u1.jpg");
  assertEquals((value as { b: string }).b, "keep me");
});

Deno.test("rewrite: KV plan replaces evidence and fleet-doc links; parts stays a key", () => {
  const index = manifestIndex([
    { bucket: "ephemeral-evidence", path: "org-a/fuel_receipt/u1.jpg", key: "evidence/org-a/fuel_receipt/u1.jpg", ok: true },
    { bucket: "make-37f42386-docs", path: "org-a/driver-docs/u2.pdf", key: "fleet-docs/legacy/org-a/driver-docs/u2.pdf", ok: true },
    { bucket: "parts-imports", path: "b1/source.csv", key: "parts-imports/platform/b1/source.csv", ok: true },
  ]);
  const rows = [{
    key: "transaction:t1",
    value: {
      receiptUrl: EVIDENCE_URL,
      licenceUrl: `${BASE}/storage/v1/object/sign/make-37f42386-docs/org-a/driver-docs/u2.pdf?token=z`,
      importPath: "parts-imports/b1/source.csv",
    },
  }];
  const { updates, skipped } = planKvRewrites(rows, index, SIGN);
  assertEquals(skipped.length, 0);
  assertEquals(updates.length, 1);
  const doc = updates[0].patch.value as Record<string, string>;
  assertEquals(doc.receiptUrl, "LINK:evidence/org-a/fuel_receipt/u1.jpg");
  assertEquals(doc.licenceUrl, "LINK:fleet-docs/legacy/org-a/driver-docs/u2.pdf");
  assertEquals(doc.importPath, "parts-imports/platform/b1/source.csv");

  // Idempotence: planning again on the rewritten record changes nothing.
  const again = planKvRewrites([{ key: "transaction:t1", value: doc }], index, SIGN);
  assertEquals(again.updates, []);
});

Deno.test("rewrite: a KV record nested in fuelCycles is rewritten (the reason the quick scan missed it)", () => {
  // The live shape: fuel receipt + odometer links inside fuelCycles[0].transactions[0].
  const index = manifest([
    { bucket: "ephemeral-evidence", path: "org-a/fuel_receipt/u1.jpg", key: "evidence/org-a/fuel_receipt/u1.jpg" },
    { bucket: "ephemeral-evidence", path: "org-a/odometer_proof/u2.jpg", key: "evidence/org-a/odometer_proof/u2.jpg" },
  ]);
  const doc = {
    key: "finalized_report:2026-09-07:driver-1",
    fuelCycles: [{
      transactions: [{
        id: "t1",
        metadata: { receiptUrl: EVIDENCE_URL },
        receiptUrl: EVIDENCE_URL,
        odometerProofUrl: `${BASE}/storage/v1/object/sign/ephemeral-evidence/org-a/odometer_proof/u2.jpg?token=zzz123456789`,
      }],
    }],
  };
  const { updates, skipped } = planKvRewrites([{ key: "finalized_report:2026-09-07:driver-1", value: doc }], index, SIGN);
  assertEquals(skipped.length, 0);
  assertEquals(updates.length, 1);
  const rewritten = updates[0].patch.value;
  assertEquals(rewritten.fuelCycles[0].transactions[0].metadata.receiptUrl, "LINK:evidence/org-a/fuel_receipt/u1.jpg");
  assertEquals(rewritten.fuelCycles[0].transactions[0].receiptUrl, "LINK:evidence/org-a/fuel_receipt/u1.jpg");
  assertEquals(
    rewritten.fuelCycles[0].transactions[0].odometerProofUrl,
    "LINK:evidence/org-a/odometer_proof/u2.jpg",
  );

  const second = planKvRewrites([{ key: "finalized_report:2026-09-07:driver-1", value: rewritten }], index, SIGN);
  assertEquals(second.updates, []);
});

Deno.test("rewrite: evidence_files becomes r2:private with the new key and a signed link", () => {
  const index = manifest([
    { bucket: "ephemeral-evidence", path: "org-a/fuel_receipt/u1.jpg", key: "evidence/org-a/fuel_receipt/u1.jpg" },
  ]);
  const rows = [{
    id: "e1",
    bucket_id: "ephemeral-evidence",
    storage_path: "org-a/fuel_receipt/u1.jpg",
    public_url: EVIDENCE_URL,
    status: "active",
  }];
  const { updates } = planEvidenceRewrites(rows, index, SIGN);
  assertEquals(updates.length, 1);
  assertEquals(updates[0].patch, {
    bucket_id: "r2:private",
    storage_path: "evidence/org-a/fuel_receipt/u1.jpg",
    public_url: "LINK:evidence/org-a/fuel_receipt/u1.jpg",
  });

  // Already migrated → nothing to do.
  const again = planEvidenceRewrites([{ ...rows[0], bucket_id: "r2:private" }], index, SIGN);
  assertEquals(again.updates, []);
});

Deno.test("rewrite: evidence that was not copied keeps its address and is reported", () => {
  const index = manifest([]);
  const { updates, skipped } = planEvidenceRewrites([{
    id: "e2",
    bucket_id: "ephemeral-evidence",
    storage_path: "org-a/fuel_receipt/gone.jpg",
    public_url: EVIDENCE_URL,
    status: "deleted",
  }], index, SIGN);
  assertEquals(updates, []);
  assertEquals(skipped.length, 1);
  assert(skipped[0].reason.includes("evidence deleted"));
});

Deno.test("rewrite: part_import_batch.storage_path becomes the R2 key", () => {
  const index = manifestIndex([{
    bucket: "parts-imports",
    path: "b1/source.csv",
    key: "parts-imports/platform/b1/source.csv",
    ok: true,
  }]);
  const { updates } = planPartsRewrites([{ id: "p1", storage_path: "b1/source.csv" }], index);
  assertEquals(updates[0].patch, { storage_path: "parts-imports/platform/b1/source.csv" });

  const again = planPartsRewrites([{ id: "p1", storage_path: "parts-imports/platform/b1/source.csv" }], index);
  assertEquals(again.updates, []);
});

Deno.test("rewrite: a plain text column in another table is rewritten, a bare path is not guessed", () => {
  const index = manifest([
    { bucket: "ephemeral-evidence", path: "org-a/fuel_receipt/u1.jpg", key: "evidence/org-a/fuel_receipt/u1.jpg" },
  ]);
  const { updates } = planTableRewrites(
    [{ id: "r1", receipt_url: EVIDENCE_URL }, { id: "r2", receipt_url: "org-a/fuel_receipt/u1.jpg" }],
    { column: "receipt_url", index, signLink: SIGN, schema: "fleet", table: "transactions", pkColumn: "id" },
  );
  assertEquals(updates.length, 1);
  assertEquals(updates[0].patch, { receipt_url: "LINK:evidence/org-a/fuel_receipt/u1.jpg" });
});

Deno.test("rewrite: only ok=true manifest entries are used", () => {
  const index = manifestIndex([
    { bucket: "ephemeral-evidence", path: "a/b.jpg", key: "evidence/a/b.jpg", ok: false },
    { bucket: "ephemeral-evidence", path: "a/c.jpg", key: "evidence/a/c.jpg", ok: true },
  ]);
  assertEquals(index.size, 1);
  assert(index.has("ephemeral-evidence\u0000a/c.jpg"));
  assertEquals(countManifest([{ ok: true, size: 5 }, { ok: false, size: 7, skip: "deleted" }]), {
    total: 2,
    ok: 1,
    failed: 0,
    skipped: 1,
    bytes: 5,
  });
});

Deno.test("rewrite summary counts rows, fields and skipped references", () => {
  const index = manifest([{ bucket: "ephemeral-evidence", path: "a/b.jpg", key: "evidence/a/b.jpg" }]);
  const results = [
    planKvRewrites([{ key: "transaction:t1", value: { u: `${BASE}/storage/v1/object/sign/ephemeral-evidence/a/b.jpg?token=x` } }], index, SIGN),
    planEvidenceRewrites([], index, SIGN),
  ];
  assertEquals(summarizeRewrites(results), { rowCount: 1, editCount: 1, skipped: 0 });
});

// ---------------------------------------------------------------- inventory guardrails

Deno.test("inventory: ledger tables and ledger KV keys are skipped", () => {
  assert(isLedgerTable("ledger_events"));
  assert(isLedgerTable("expense_journal"));
  assert(isLedgerTable("finance_period_lines"));
  assert(isLedgerTable("payment_ledger_lines"));
  assert(!isLedgerTable("evidence_files"));
  assert(isLedgerKvKey("ledger_event:abc"));
  assert(isLedgerKvKey("toll_ledger:abc"));
  assert(!isLedgerKvKey("transaction:abc"));
});

Deno.test("inventory: OpenAPI tables are read per schema, with a usable primary key", () => {
  const publicSpec = {
    definitions: {
      evidence_files: {
        properties: { id: { type: "string" }, public_url: { type: "string" }, metadata: { type: "object" } },
      },
      "rides.ledger_lines": { properties: { id: { type: "string" } } },
    },
  };
  const publicTables = parseOpenApiTables(publicSpec, "public");
  assertEquals(publicTables.map((t) => `${t.schema}.${t.table}`), ["public.evidence_files"]);
  assertEquals(publicTables[0].columns.metadata, "json");
  assertEquals(publicTables[0].columns.public_url, "text");
  assertEquals(pickPrimaryKey(publicTables[0].columns), "id");

  const fleetSpec = {
    definitions: { "fleet.transactions": { properties: { id: { type: "string" }, payload_json: { format: "jsonb" } } } },
  };
  const fleetTables = parseOpenApiTables(fleetSpec, "fleet");
  assertEquals(fleetTables.map((t) => `${t.schema}.${t.table}`), ["fleet.transactions"]);
  assertEquals(fleetTables[0].columns.payload_json, "json");
});


Deno.test("inventory: a uuid column is never searched as text (fleet_inv_asset.receipt_id)", () => {
  const tables = parseOpenApiTables({
    definitions: {
      fleet_inv_asset: {
        properties: {
          id: { type: "string", format: "uuid" },
          receipt_id: { type: "string", format: "uuid" },
          name: { type: "string", format: "text" },
          note: { type: "string" },
        },
      },
    },
  }, "public");
  assertEquals(tables[0].columns.receipt_id, "other");
  assertEquals(tables[0].columns.id, "other");
  assertEquals(tables[0].columns.name, "text");
  assertEquals(tables[0].columns.note, "text");
});

Deno.test("inventory: dry-run output never shows a whole signature", () => {
  const shown = shortenLink(EVIDENCE_URL);
  assert(!shown.includes("abcdef123456789"));
  assert(shown.includes("token=abcdef…"));
});

// ---------------------------------------------------------------- fleet.* (SQL half)

const DOC_KEY = "fleet-docs/legacy/driver-docs/u2.pdf";
const DOC_URL = `${BASE}/storage/v1/object/sign/make-37f42386-docs/driver-docs/u2.pdf?token=abcdef123456789`;

function docIndex() {
  return manifestIndex([{ bucket: "make-37f42386-docs", path: "driver-docs/u2.pdf", key: DOC_KEY, ok: true }]);
}

function driversGroups() {
  const target = { table: "drivers", view: "fleet_drivers", pk: "id", columns: [] };
  const payload = { licenseUrl: DOC_URL };
  // What Postgres returns for payload_json::text (its spacing is part of the md5).
  const payloadText = `{"licenseUrl": ${JSON.stringify(DOC_URL)}}`;
  return [
    {
      target,
      column: "payload_json",
      kind: "json",
      rows: [{ pk: "d1", value: payload, rawText: payloadText, refs: findOldReferences(payload) }],
    },
    {
      target,
      column: "license_front_url",
      kind: "text",
      rows: [{ pk: "d1", value: DOC_URL, rawText: DOC_URL, refs: findOldReferences(DOC_URL) }],
    },
  ];
}

Deno.test("fleet: a drivers row is rewritten — payload_json and the url column merge into one row", () => {
  const plan = planFleetRewrites(driversGroups(), docIndex(), SIGN);
  assertEquals(plan.rows.length, 1);
  const row = plan.rows[0];
  assertEquals(row.table, "drivers");
  assertEquals(row.pk, "d1");
  assertEquals(row.columns.map((c) => c.column).sort(), ["license_front_url", "payload_json"]);
  const link = row.columns.find((c) => c.column === "license_front_url").newValue;
  assertEquals(link, `LINK:${DOC_KEY}`);
  const payload = row.columns.find((c) => c.column === "payload_json").newValue;
  assertEquals(payload, { licenseUrl: `LINK:${DOC_KEY}` });
  assertEquals(summarizeFleetRows(plan.rows), [{ table: "fleet.drivers", rows: 1 }]);
});

Deno.test("fleet: a file that was not copied is reported, not rewritten", () => {
  const plan = planFleetRewrites(driversGroups(), manifestIndex([]), SIGN);
  assertEquals(plan.rows, []);
  assertEquals(plan.skipped.length, 2);
  assert(plan.skipped[0].reason.includes("not in manifest"));
});

Deno.test("fleet SQL: the right row and the right new value, backup before update", () => {
  const plan = planFleetRewrites(driversGroups(), docIndex(), SIGN);
  const entries = [{ bucket: "make-37f42386-docs", path: "driver-docs/u2.pdf", key: DOC_KEY, ok: true }];
  const at = new Date("2026-11-25T08:00:00Z");
  const sql = buildFleetRewriteSql({ rows: plan.rows, entries, at });

  assert(sql.includes("where id = 'd1'"));
  assert(sql.includes(`license_front_url = $r2m5$${SIGN(DOC_KEY)}$r2m5$`));
  assert(sql.includes("insert into fleet.r2_migration_m5_backup"));
  assert(sql.includes("on conflict do nothing;"));
  assert(
    sql.indexOf("insert into fleet.r2_migration_m5_backup") <
      sql.indexOf("update fleet.drivers"),
    "the backup must run before any update",
  );
  assert(sql.includes("rows_still_old"));
  assert(sql.includes(`$r2m5$${copiedPathPattern(entries)}$r2m5$`));
  assertEquals(sql, buildFleetRewriteSql({ rows: plan.rows, entries, at }), "generation is deterministic");
});

Deno.test("fleet SQL: the backup table lives in fleet, with RLS on and anon/authenticated revoked", () => {
  const plan = planFleetRewrites(driversGroups(), docIndex(), SIGN);
  const entries = [{ bucket: "make-37f42386-docs", path: "driver-docs/u2.pdf", key: DOC_KEY, ok: true }];
  const sql = buildFleetRewriteSql({ rows: plan.rows, entries, at: new Date("2026-11-25T08:00:00Z") });

  assert(sql.includes("create table if not exists fleet.r2_migration_m5_backup"));
  assert(!sql.includes("create table if not exists public.r2_migration_m5_backup"));
  assert(sql.includes("alter table fleet.r2_migration_m5_backup enable row level security;"));
  assert(sql.includes("revoke all on fleet.r2_migration_m5_backup from anon, authenticated;"));
  // Restore note points at the fleet table too.
  assert(sql.includes("from fleet.r2_migration_m5_backup b"));
  assert(!sql.includes("from public.r2_migration_m5_backup b"));
});

Deno.test("fleet SQL: every update and every backup insert has the md5 stale-write guard", () => {
  const plan = planFleetRewrites(driversGroups(), docIndex(), SIGN);
  const entries = [{ bucket: "make-37f42386-docs", path: "driver-docs/u2.pdf", key: DOC_KEY, ok: true }];
  const sql = buildFleetRewriteSql({ rows: plan.rows, entries, at: new Date("2026-11-25T08:00:00Z") });

  // Two columns on the row -> two backup inserts, each guarded by that column's dry-run md5.
  const inserts = sql.split("insert into fleet.r2_migration_m5_backup").slice(1);
  assertEquals(inserts.length, 2);
  for (const block of inserts) {
    const statement = block.split("on conflict")[0];
    assert(/md5\([a-z_.]+::text\) = '[0-9a-f]{32}'/.test(statement), "every backup insert is guarded");
  }

  // One update for the row, guarded on every column it writes.
  const updates = sql.split("with u as (").slice(1);
  assertEquals(updates.length, 1);
  const update = updates[0].split("insert into r2_m5_updated_rows")[0];
  assertEquals(update.match(/and md5\([a-z_.]+::text\) = '[0-9a-f]{32}'/g)?.length, 2);
  assert(update.includes(`md5(payload_json::text) = '${md5Hex(`{"licenseUrl": ${JSON.stringify(DOC_URL)}}`)}'`));
  assert(update.includes(`md5(license_front_url::text) = '${md5Hex(DOC_URL)}'`));
});

Deno.test("fleet SQL: planned - updated is printed per table so changed rows are counted", () => {
  const plan = planFleetRewrites(driversGroups(), docIndex(), SIGN);
  const entries = [{ bucket: "make-37f42386-docs", path: "driver-docs/u2.pdf", key: DOC_KEY, ok: true }];
  const sql = buildFleetRewriteSql({ rows: plan.rows, entries, at: new Date("2026-11-25T08:00:00Z") });

  assert(sql.includes("select 'fleet.drivers' as table_name, 1 as planned,"));
  assert(sql.includes("as skipped_changed;"));
  assert(sql.includes("insert into r2_m5_updated_rows(table_name, pk)"));
  assert(sql.includes("returning id::text as pk"));
});

Deno.test("fleet SQL: a second run changes nothing (no old address left to plan)", () => {
  const first = planFleetRewrites(driversGroups(), docIndex(), SIGN);
  assertEquals(first.rows.length, 1);

  // Same rows after the SQL has run: every value is the new one and discovery finds no refs.
  const rewritten = driversGroups().map((group) => ({
    ...group,
    rows: group.rows.map((row) => {
      const value = group.kind === "json" ? { licenseUrl: `LINK:${DOC_KEY}` } : `LINK:${DOC_KEY}`;
      return { ...row, value, refs: findOldReferences(value) };
    }),
  }));
  const second = planFleetRewrites(rewritten, docIndex(), SIGN);
  assertEquals(second.rows, []);
  assertEquals(second.skipped, []);

  const entries = [{ bucket: "make-37f42386-docs", path: "driver-docs/u2.pdf", key: DOC_KEY, ok: true }];
  const emptySql = buildFleetRewriteSql({ rows: [], entries, at: new Date("2026-11-25T08:00:00Z") });
  assert(!emptySql.includes("\nupdate fleet."));
  assert(emptySql.includes("select 'backup rows' as target, count(*) as backed_up"));
});

Deno.test("fleet SQL: read-only inventory counts the same pattern and writes nothing", () => {
  const entries = [{ bucket: "ephemeral-evidence", path: "o/fuel_receipt/a.jpg", key: "evidence/o/fuel_receipt/a.jpg", ok: true }];
  const sql = buildFleetInventorySql({ entries, at: new Date("2026-11-25T08:00:00Z") });
  assert(sql.startsWith("-- M5 fleet inventory (READ-ONLY)"));
  assert(sql.includes("begin transaction read only;"));
  assert(sql.includes("rows_with_old_address"));
  assert(!sql.includes("update "));
  assert(!sql.includes("insert into public.r2_migration_m5_backup"));
  assert(sql.includes("fleet.fuel_entries"));
  assert(sql.includes("fleet.drivers"));
});

// ---------------------------------------------------------------- apply: stale-write guard

Deno.test("apply: a KV row changed between plan and write is skipped, not overwritten", () => {
  const index = manifest([
    { bucket: "ephemeral-evidence", path: "org-a/fuel_receipt/u1.jpg", key: "evidence/org-a/fuel_receipt/u1.jpg" },
  ]);
  const planned = { receiptUrl: EVIDENCE_URL, note: "fuel" };
  const plan = planKvRewrites([{ key: "transaction:t1", value: planned }], index, SIGN);
  assertEquals(plan.updates.length, 1);
  const update = plan.updates[0];
  const key = updateFreshKey(update);
  assertEquals(key, "public.kv_store_37f42386\u0000transaction:t1");

  // Same value with a different key order → unchanged, so it may be written.
  const same = new Map([[key, { key: "transaction:t1", value: { note: "fuel", receiptUrl: EVIDENCE_URL } }]]);
  assertEquals(partitionUpdates(plan.updates, same).ready.length, 1);

  // An edit landed after the dry run → skipped, never overwritten.
  const edited = new Map([[key, { key: "transaction:t1", value: { ...planned, note: "edited" } }]]);
  const changedResult = partitionUpdates(plan.updates, edited);
  assertEquals(changedResult.ready, []);
  assertEquals(changedResult.changed.length, 1);
  assertEquals(changedResult.changed[0].pk, "transaction:t1");

  // Row deleted since the dry run → also skipped.
  const missing = partitionUpdates(plan.updates, new Map());
  assertEquals(missing.ready, []);
  assertEquals(missing.changed[0].reason, "row no longer readable");
});

Deno.test("apply: an evidence row whose link moved is skipped", () => {
  const index = manifest([
    { bucket: "ephemeral-evidence", path: "org-a/fuel_receipt/u1.jpg", key: "evidence/org-a/fuel_receipt/u1.jpg" },
  ]);
  const row = {
    id: "e1",
    bucket_id: "ephemeral-evidence",
    storage_path: "org-a/fuel_receipt/u1.jpg",
    public_url: EVIDENCE_URL,
    status: "active",
  };
  const plan = planEvidenceRewrites([row], index, SIGN);
  const key = updateFreshKey(plan.updates[0]);
  const fresh = new Map([[key, { ...row, public_url: `${EVIDENCE_URL}x` }]]);
  const { ready, changed } = partitionUpdates(plan.updates, fresh);
  assertEquals(ready, []);
  assertEquals(changed.length, 1);
});

