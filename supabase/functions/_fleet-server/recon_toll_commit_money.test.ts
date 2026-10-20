/**
 * R4-02: wizard toll commit must post money events (canonical + toll_usage),
 * not only bulk_insert_toll_ledger + kv.set.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const CONTROLLER = new URL("./toll_controller.tsx", import.meta.url);
const IMPORT_ROUTES = new URL("./recon_import_routes.ts", import.meta.url);

Deno.test("toll_controller exports prepareTollLedgerEntry and afterTollLedgerInsert", async () => {
  const src = await Deno.readTextFile(CONTROLLER);
  assert(
    /async function prepareTollLedgerEntry\(/.test(src),
    "missing prepareTollLedgerEntry",
  );
  assert(
    /async function afterTollLedgerInsert\(/.test(src),
    "missing afterTollLedgerInsert",
  );
  assert(
    /export \{\s*[\s\S]*prepareTollLedgerEntry[\s\S]*afterTollLedgerInsert/.test(src) ||
      /prepareTollLedgerEntry,\s*[\s\S]*afterTollLedgerInsert/.test(src),
    "prepare/afterInsert must be exported for recon bulk commit",
  );
  assert(
    /saveTollLedgerEntry[\s\S]*prepareTollLedgerEntry[\s\S]*afterTollLedgerInsert/.test(src) ||
      (/await prepareTollLedgerEntry\(/.test(src) && /await afterTollLedgerInsert\(/.test(src)),
    "saveTollLedgerEntry must call prepare then afterInsert",
  );
});

Deno.test("afterTollLedgerInsert posts canonical toll and toll_usage", async () => {
  const src = await Deno.readTextFile(CONTROLLER);
  const afterIdx = src.indexOf("async function afterTollLedgerInsert");
  assert(afterIdx >= 0, "afterTollLedgerInsert not found");
  const nextFn = src.indexOf("\nasync function ", afterIdx + 10);
  const body = src.slice(afterIdx, nextFn > 0 ? nextFn : afterIdx + 2500);
  assert(
    /appendCanonicalTollIfEligible/.test(body),
    "afterInsert must call appendCanonicalTollIfEligible (Business Finance P&L)",
  );
  assert(
    /fleetDualWriteToll/.test(body),
    "afterInsert must call fleetDualWriteToll",
  );
  assert(
    /ensureActiveTollUsagePostedForEntry/.test(body),
    "afterInsert must ensure toll_usage financial event",
  );
});

Deno.test("recon import commit uses prepare + afterInsert on bulk path", async () => {
  const src = await Deno.readTextFile(IMPORT_ROUTES);
  assert(
    /prepareTollLedgerEntry/.test(src),
    "commit must call prepareTollLedgerEntry before bulk insert",
  );
  assert(
    /afterTollLedgerInsert/.test(src),
    "commit must call afterTollLedgerInsert after bulk insert",
  );
  assert(
    /bulk_insert_toll_ledger[\s\S]*afterTollLedgerInsert/.test(src),
    "afterInsert must run on the bulk success path (not only fallback)",
  );
});
