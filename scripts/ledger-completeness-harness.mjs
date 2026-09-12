#!/usr/bin/env node
/**
 * Ledgers §12 harness — pure completeness/stats helpers always;
 * optional live API when LEDGER_HARNESS_TOKEN + SUPABASE_URL are set.
 */
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const modPath = join(__dirname, "../apps/fleet/src/utils/ledgerCompleteness.ts");
const { assertPaginationCompleteness, assertStatsAgree } = await import(pathToFileURL(modPath).href);

const pageOk = assertPaginationCompleteness([["a", "b"], ["c"]], ["a", "b", "c"]);
if (!pageOk.ok) {
  console.error("pagination pure fail", pageOk);
  process.exit(1);
}
const statsOk = assertStatsAgree(
  [{ amount: 10.1, net: 9.05 }, { amount: 0.2, net: 0.1 }],
  { sumAmount: 10.3, sumNet: 9.15 },
);
if (!statsOk.ok) {
  console.error("stats pure fail", statsOk);
  process.exit(1);
}

const token = process.env.LEDGER_HARNESS_TOKEN;
const base = process.env.SUPABASE_URL;
const orgId = process.env.ORG_ID;

if (token && base) {
  const url = `${base.replace(/\/$/, "")}/functions/v1/make-server-37f42386/trips/search`;
  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: process.env.SUPABASE_ANON_KEY || "",
    "Content-Type": "application/json",
  };
  const limit = 25;
  const pageIdLists = [];
  let apiTotal = null;
  let offset = 0;
  // R-07: sweep pages independently of expected-from-pages so skips are detectable
  const maxPages = 200;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        limit,
        offset,
        organizationId: orgId,
        sortKey: "date",
        sortDir: "desc",
      }),
    }).then((r) => r.json());
    if (page.error) {
      console.error("ledger-completeness-harness: live search failed", page.error);
      process.exit(1);
    }
    if (apiTotal == null) {
      apiTotal = Number(page.total ?? 0);
    }
    const ids = (page.data || []).map((t) => t.id).filter(Boolean);
    pageIdLists.push(ids);
    offset += limit;
    if (ids.length === 0 || offset >= apiTotal) break;
  }

  const flat = pageIdLists.flat();
  const uniqueUnion = [...new Set(flat)];
  // Detect duplicates within the stream
  const live = assertPaginationCompleteness(pageIdLists, uniqueUnion);
  if (!live.ok) {
    console.error("ledger-completeness-harness: live fail", live);
    process.exit(1);
  }
  // Independent expected size = API total (detects skips R-07)
  if (uniqueUnion.length !== apiTotal) {
    console.error("ledger-completeness-harness: live fail", {
      ok: false,
      reason: `skip/count mismatch: unique union ${uniqueUnion.length} != API total ${apiTotal}`,
    });
    process.exit(1);
  }
  console.log(`ledger-completeness-harness: live OK (${uniqueUnion.length} unique ids == total ${apiTotal})`);
} else {
  console.log("ledger-completeness-harness: pure OK (set LEDGER_HARNESS_TOKEN + SUPABASE_URL for live)");
}
