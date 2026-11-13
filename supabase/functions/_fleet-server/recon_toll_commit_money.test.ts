/**
 * Old toll removal S1 (docs/toll-old-system-removal-audit.md): toll files no longer commit through the Week
 * Reconciliation import path into the old toll ledger. They go through the new toll upload and /register.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const IMPORT_ROUTES = new URL("./recon_import_routes.ts", import.meta.url);

Deno.test("recon import commit refuses toll files (TOLLS_MOVED) and never writes the old toll ledger", async () => {
  const src = await Deno.readTextFile(IMPORT_ROUTES);
  const start = src.indexOf('"/make-server-37f42386/recon/imports/:id/commit"');
  assert(start >= 0, "commit route");
  const end = src.indexOf("app.post(", start);
  const body = src.slice(start, end > 0 ? end : undefined);
  assert(body.includes('error: "TOLLS_MOVED"') && body.includes("410"), "toll commit answers TOLLS_MOVED 410");
  for (const old of ["saveTollLedgerEntry", "prepareTollLedgerEntry", "afterTollLedgerInsert", "getAllTollLedgerEntries"]) {
    assert(!src.includes(old), `recon import must not use the old toll ledger (${old})`);
  }
  assert(!src.includes("./toll_controller.tsx"), "no import of the old toll controller");
});
