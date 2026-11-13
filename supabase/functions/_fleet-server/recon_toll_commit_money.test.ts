/**
 * Old toll removal S1 (docs/toll-old-system-removal-audit.md): toll files no longer go through the Week
 * Reconciliation import path into the old toll ledger. They use the new toll upload and /register.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./recon_import_routes.ts", import.meta.url));

function routeBody(path: string): string {
  const start = src.indexOf(`app.post(\n    "${path}",`);
  assert(start >= 0, path);
  const end = src.indexOf("app.post(", start + 10);
  return src.slice(start, end > 0 ? end : undefined);
}

Deno.test("toll files are refused at create (before review) and at commit, with TOLLS_MOVED 410", () => {
  const helper = src.slice(src.indexOf("function tollsMoved("), src.indexOf("function tollsMoved(") + 400);
  assert(helper.includes('error: "TOLLS_MOVED"') && helper.includes("410"), "helper answers TOLLS_MOVED 410");
  const create = routeBody("/make-server-37f42386/recon/imports");
  assert(create.includes("if (isTollSource(sourceId)) return tollsMoved(c);"), "create refuses toll files");
  const commit = routeBody("/make-server-37f42386/recon/imports/:id/commit");
  assert(commit.includes("if (isTollSource(sourceId)) return tollsMoved(c);"), "commit refuses toll files");
  assert(commit.includes('error: "INVALID_SOURCE"'), "a non-fuel, non-toll file gets INVALID_SOURCE, not a toll message");
});

Deno.test("recon import never writes the old toll ledger", () => {
  for (const old of ["saveTollLedgerEntry", "prepareTollLedgerEntry", "afterTollLedgerInsert", "getAllTollLedgerEntries"]) {
    assert(!src.includes(old), `no old toll ledger use (${old})`);
  }
  assert(!src.includes("./toll_controller.tsx"), "no import of the old toll controller");
});
