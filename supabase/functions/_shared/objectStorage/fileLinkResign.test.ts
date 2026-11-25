/**
 * Monthly file-link re-sign (docs/cloudflare-r2-storage-migration-audit.md §0, link-expiry fix).
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { FILE_LINK_SECONDS, signFileLink, verifyFileLink } from "./fileLink.ts";
import {
  attentionFor,
  LEDGER_KV_PREFIXES,
  RESIGN_TARGETS,
  RESIGN_WINDOW_SECONDS,
  renewLinkUrl,
  renewLinksDeep,
  resignTarget,
} from "./fileLinkResign.ts";

const SECRET = "test-file-link-secret";
const BASE = "https://csfllzzastacofsvcdsc.supabase.co";
const NOW = 1_800_000_000;
const DAY = 24 * 60 * 60;
const KEY = "evidence/org-a/fuel_receipt/2f6b1c1e-0000-4000-8000-000000000001.jpg";

const opts = { secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW };

/** A link whose expiry is `days` from NOW. */
async function linkExpiringIn(days: number, key = KEY): Promise<string> {
  return await signFileLink({
    key,
    secret: SECRET,
    supabaseUrl: BASE,
    nowSeconds: NOW - (365 - days) * DAY,
  });
}

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

/**
 * Fake database for the re-sign job. Reads go only through rpc("file_link_resign_scan") (filtered
 * in the database, keyset paged); writes only through rpc("file_link_resign_cas"). Direct table
 * access throws, so a return to .from(...).eq(column, object) — the "[object Object]" bug — or to
 * whole-table reads fails the tests.
 */
function fakeSb(rows: Array<{ pk: string; value: unknown }>, { casResult = true } = {}) {
  const calls = {
    scan: [] as Array<Record<string, unknown>>,
    cas: [] as Array<{ name: string; params: Record<string, unknown> }>,
  };
  const sorted = [...rows].sort((x, y) => (x.pk < y.pk ? -1 : x.pk > y.pk ? 1 : 0));
  const noTables = () => {
    throw new Error("direct table access is not allowed; use file_link_resign_scan / _cas");
  };
  return {
    calls,
    schema: noTables,
    from: noTables,
    rpc: (name: string, params: Record<string, unknown>) => {
      if (name === "file_link_resign_scan") {
        calls.scan.push(params);
        const after = params.p_after as string | null;
        const limit = Number(params.p_limit);
        const page = sorted.filter((r) => after === null || r.pk > after).slice(0, limit);
        return Promise.resolve({ data: page, error: null });
      }
      if (name === "file_link_resign_cas") {
        calls.cas.push({ name, params });
        return Promise.resolve({ data: casResult, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
    },
  };
}

Deno.test("resign: a link due in 30 days is renewed for the SAME key and verifies", async () => {
  const old = await linkExpiringIn(30);
  assertEquals(Number(params(old).get("e")), NOW + 30 * DAY);

  const result = await renewLinkUrl(old, opts);
  assertEquals(result.action, "renew");
  if (result.action !== "renew") return;
  assertEquals(result.key, KEY);
  assertEquals(params(result.url).get("k"), KEY);
  assertEquals(params(result.url).get("e"), String(NOW + FILE_LINK_SECONDS));
  assertEquals(await verifyFileLink(params(result.url), SECRET, NOW + 10), { ok: true, key: KEY });
});

Deno.test("resign: a link due in 200 days is untouched", async () => {
  const old = await linkExpiringIn(200);
  const result = await renewLinkUrl(old, opts);
  assertEquals(result.action, "not_due");
  if (result.action === "not_due") {
    assertEquals(result.key, KEY);
    assertEquals(result.expiresAt, NOW + 200 * DAY);
  }
});

Deno.test("resign: an already-expired link with a valid signature is renewed", async () => {
  const old = await linkExpiringIn(-5);
  const result = await renewLinkUrl(old, opts);
  assertEquals(result.action, "renew");
  if (result.action === "renew") {
    assertEquals(result.oldExpiresAt, NOW - 5 * DAY);
    assertEquals(await verifyFileLink(params(result.url), SECRET, NOW + 10), { ok: true, key: KEY });
  }
});

Deno.test("resign: a foreign or tampered signature is never re-signed", async () => {
  const good = await linkExpiringIn(10);
  const tampered = new URL(good);
  tampered.searchParams.set("k", "evidence/org-b/fuel_receipt/other.jpg");
  const result = await renewLinkUrl(tampered.toString(), opts);
  assertEquals(result.action, "invalid");
  if (result.action === "invalid") assertEquals(result.reason, "bad_signature");

  const foreign = await signFileLink({
    key: KEY,
    secret: "another-secret",
    supabaseUrl: BASE,
    nowSeconds: NOW - (365 - 10) * DAY,
  });
  assertEquals((await renewLinkUrl(foreign, opts)).action, "invalid");
});

Deno.test("resign: non-file-link URLs and other fields are untouched", async () => {
  const due = await linkExpiringIn(30);
  const value = {
    id: "t1",
    other: "https://example.com/storage/v1/object/sign/ephemeral-evidence/a.jpg?token=x",
    note: "fuel",
    receiptUrl: due,
  };
  const result = await renewLinksDeep(value, opts);
  assertEquals(result.renewals.length, 1);
  assertEquals(result.renewals[0].pointer, "receiptUrl");
  assertEquals(result.linksSeen, 1);
  const next = result.value as Record<string, unknown>;
  assertEquals(next.other, value.other);
  assertEquals(next.note, "fuel");
  assert(String(next.receiptUrl).includes("file-link?"));
  assertEquals(params(String(next.receiptUrl)).get("k"), KEY);
});

Deno.test("resign: links nested in KV/payload arrays are found and renewed", async () => {
  const due = await linkExpiringIn(20);
  const value = {
    fuelCycles: [{
      transactions: [{
        id: "x",
        metadata: { receiptUrl: due, odometerProofUrl: due },
        receiptUrl: due,
      }],
    }],
  };
  const result = await renewLinksDeep(value, opts);
  assertEquals(result.renewals.map((r) => r.pointer).sort(), [
    "fuelCycles[0].transactions[0].metadata.odometerProofUrl",
    "fuelCycles[0].transactions[0].metadata.receiptUrl",
    "fuelCycles[0].transactions[0].receiptUrl",
  ]);
  const first = result.value as typeof value;
  assertEquals(params(first.fuelCycles[0].transactions[0].metadata.receiptUrl).get("k"), KEY);
});

Deno.test("resign: a second run renews nothing", async () => {
  const due = await linkExpiringIn(30);
  const first = await renewLinkUrl(due, opts);
  assertEquals(first.action, "renew");
  if (first.action !== "renew") return;
  assertEquals((await renewLinkUrl(first.url, opts)).action, "not_due");
});

Deno.test("resign: a row changed between read and write is skipped and counted (rpc returns false)", async () => {
  const due = await linkExpiringIn(30);
  const target = { schema: "public", table: "evidence_files", pk: "id", column: "public_url", kind: "text" as const };
  const sb = fakeSb([{ pk: "r1", value: due }], { casResult: false });
  const summary = await resignTarget(sb, target, { ...opts, dryRun: false });
  assertEquals(summary.renewed, 0);
  assertEquals(summary.skippedChanged, 1);
  assertEquals(sb.calls.cas.length, 1);
  const call = sb.calls.cas[0];
  assertEquals(call.name, "file_link_resign_cas");
  assertEquals(call.params.p_target, "public.evidence_files.public_url");
  assertEquals(call.params.p_pk, "r1");
  assertEquals(call.params.p_old, due);
  assert(String(call.params.p_new).includes("file-link?"));
});

Deno.test("resign: a nested KV record is renewed through the rpc path", async () => {
  const due = await linkExpiringIn(20);
  const key = "finalized_report:2026-09-07:73e5b1dc";
  const value = {
    fuelCycles: [{ transactions: [{ metadata: { receiptUrl: due }, receiptUrl: due }] }],
  };
  const target = {
    schema: "public",
    table: "kv_store_37f42386",
    pk: "key",
    column: "value",
    kind: "json" as const,
    skipLedgerKeys: true,
  };
  const sb = fakeSb([{ pk: key, value }]);
  const summary = await resignTarget(sb, target, { ...opts, dryRun: false });

  assertEquals(summary.renewed, 2);
  assertEquals(sb.calls.cas.length, 1);
  const call = sb.calls.cas[0];
  assertEquals(call.params.p_target, "public.kv_store_37f42386.value");
  assertEquals(call.params.p_pk, key);
  assertEquals(call.params.p_old, value);
  const next = call.params.p_new as typeof value;
  const renewed = next.fuelCycles[0].transactions[0];
  assertEquals(params(renewed.receiptUrl).get("k"), KEY);
  assertEquals(params(renewed.metadata.receiptUrl).get("e"), String(NOW + FILE_LINK_SECONDS));
});

Deno.test("resign: a fleet payload row is renewed through the rpc path", async () => {
  const due = await linkExpiringIn(10);
  const row = { id: "f1", payload_json: { metadata: { receiptUrl: due }, note: "fuel" } };
  const target = {
    schema: "public",
    table: "fleet_fuel_entries",
    pk: "id",
    column: "payload_json",
    kind: "json" as const,
  };
  const sb = fakeSb([{ pk: row.id, value: row.payload_json }]);
  const summary = await resignTarget(sb, target, { ...opts, dryRun: false });

  assertEquals(summary.renewed, 1);
  assertEquals(sb.calls.cas.length, 1);
  const call = sb.calls.cas[0];
  assertEquals(call.params.p_target, "public.fleet_fuel_entries.payload_json");
  assertEquals(call.params.p_pk, "f1");
  assertEquals((call.params.p_old as typeof row.payload_json).note, "fuel");
  const next = call.params.p_new as typeof row.payload_json;
  assertEquals(params(next.metadata.receiptUrl).get("k"), KEY);
  assertEquals(next.note, "fuel");
});

Deno.test("resign: dry run reports the renewal and writes nothing", async () => {
  const due = await linkExpiringIn(30);
  const target = { schema: "public", table: "evidence_files", pk: "id", column: "public_url", kind: "text" as const };
  const sb = fakeSb([{ pk: "r1", value: due }]);
  const summary = await resignTarget(sb, target, { ...opts, dryRun: true });
  assertEquals(summary.renewed, 1);
  assertEquals(summary.due, 1);
  assertEquals(sb.calls.cas.length, 0);
});

const MIGRATION = new URL(
  "../../../migrations/20261125090146_file_link_resign_schedule.sql",
  import.meta.url,
);

Deno.test("resign: the database scan skips exactly the ledger KV prefixes", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  const start = sql.indexOf("FUNCTION public.file_link_resign_scan");
  const scan = sql.slice(start, sql.indexOf("$$;", start));
  for (const prefix of LEDGER_KV_PREFIXES) assert(scan.includes(`''${prefix}%%''`), prefix);
  assertEquals((scan.match(/:%%''/g) ?? []).length, LEDGER_KV_PREFIXES.length);
});

Deno.test("resign: SQL allow-list matches RESIGN_TARGETS (names, kinds, uuid/text keys)", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  const start = sql.indexOf("FUNCTION private.file_link_resign_target");
  const block = sql.slice(start, sql.indexOf("$$;", start));
  const rows = [...block.matchAll(
    /\('([a-z_.0-9]+)', '([a-z]+)', '([a-z_0-9]+)', '([a-z_]+)', '(uuid|text)', '([a-z_]+)', '(text|json)', (true|false)\)/g,
  )];
  assertEquals(rows.length, RESIGN_TARGETS.length);
  for (const t of RESIGN_TARGETS) {
    const row = rows.find((r) => r[1] === `${t.schema}.${t.table}.${t.column}`);
    assert(row, `${t.table}.${t.column} missing from the SQL allow-list`);
    assertEquals([row[2], row[3], row[4], row[6], row[7]], [t.schema, t.table, t.pk, t.column, t.kind]);
    assertEquals(row[8] === "true", t.skipLedgerKeys === true);
  }
  // The compare-and-set uses the key's own type so the primary-key index is used.
  assert(sql.includes("WHERE %I = $2::%s AND %I = $3"));
  assert(!sql.includes("%I::text = $2"));
});

Deno.test("resign: paging walks every row (no row cap) and only through the database scan", async () => {
  const due = await linkExpiringIn(30);
  const rows = Array.from({ length: 1234 }, (_, i) => ({ pk: `k${String(i).padStart(5, "0")}`, value: due }));
  const target = { schema: "public", table: "evidence_files", pk: "id", column: "public_url", kind: "text" as const };
  const sb = fakeSb(rows);
  const summary = await resignTarget(sb, target, { ...opts, dryRun: true, pageSize: 200 });
  assertEquals(summary.scanned, 1234);
  assertEquals(summary.due, 1234);
  assertEquals(sb.calls.scan.length, 7);
  assertEquals(sb.calls.scan[0].p_after, null);
  assertEquals(sb.calls.scan[1].p_after, "k00199");
  assertEquals(sb.calls.scan[0].p_target, "public.evidence_files.public_url");
});

Deno.test("resign: attention lists failed targets, changed rows and bad signatures; empty when fine", () => {
  const base = { dryRun: false, renewed: 3, due: 3, skippedChanged: 0, skippedInvalid: 0, scanned: 3, errors: [] as string[] };
  const ok = { ...base, targets: [{ target: "a", scanned: 3, links: 3, due: 3, renewed: 3, skippedChanged: 0, skippedInvalid: 0 }] };
  assertEquals(attentionFor(ok), []);
  const bad = {
    ...base,
    errors: ["delivery.procurement_tasks.receipt_path: permission denied"],
    targets: [{ target: "a", scanned: 3, links: 3, due: 3, renewed: 1, skippedChanged: 1, skippedInvalid: 1 }],
  };
  const out = attentionFor(bad);
  assertEquals(out.length, 3);
  assert(out[0].startsWith("target failed: delivery.procurement_tasks"));
  assert(out.some((line) => line.includes("changed during the run")));
  assert(out.some((line) => line.includes("signature check")));
});

Deno.test("resign: the window is 60 days", () => {
  assertEquals(RESIGN_WINDOW_SECONDS, 60 * DAY);
});
