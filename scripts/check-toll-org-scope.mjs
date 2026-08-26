#!/usr/bin/env node
/**
 * Fails when toll_controller loses org helpers / SQL org predicates.
 * Companion to scripts/check-toll-core-parity.mjs and toll_route_auth.test.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTROLLER = path.join(
  ROOT,
  "supabase/functions/_fleet-server/toll_controller.tsx",
);
const ORG_CTX = path.join(
  ROOT,
  "supabase/functions/_fleet-server/toll_org_context.ts",
);

let failed = false;

function fail(msg) {
  failed = true;
  console.error(msg);
}

if (!fs.existsSync(ORG_CTX)) {
  fail("missing toll_org_context.ts");
} else {
  const ctx = fs.readFileSync(ORG_CTX, "utf8");
  if (!/tollOrgSqlFilters/.test(ctx)) fail("toll_org_context.ts missing tollOrgSqlFilters");
  if (!/runWithTollContext/.test(ctx)) fail("toll_org_context.ts missing runWithTollContext");
}

if (!fs.existsSync(CONTROLLER)) {
  fail("missing toll_controller.tsx");
} else {
  const src = fs.readFileSync(CONTROLLER, "utf8");

  const checks = [
    [/from\s+["']\.\/org_scope\.ts["']/, "must import org_scope helpers"],
    [/from\s+["']\.\/toll_org_context\.ts["']/, "must import toll_org_context"],
    [/runWithTollContext/, "must bind runWithTollContext for all routes"],
    [/stampOrg\s*\(/, "save path must call stampOrg"],
    [/filterByOrg\s*\(/, "read paths must call filterByOrg"],
    [/belongsToOrg\s*\(/, "single-record paths must call belongsToOrg"],
    [/tollOrgSqlFilters\s*\(/, "SQL loaders must use tollOrgSqlFilters"],
    [/iterateFleet\(\s*["']toll_ledger["']/, "getAllTollLedgerEntries must SQL-filter toll_ledger"],
    [/async function getAllTollLedgerEntries\s*\([^)]*c\??/, "getAllTollLedgerEntries must accept Context"],
    [/async function loadMergedTollTxArray\s*\([^)]*c\??/, "loadMergedTollTxArray must accept Context"],
    [/async function saveTollLedgerEntry[\s\S]{0,800}?stampOrg/, "saveTollLedgerEntry must stampOrg early"],
  ];

  for (const [re, msg] of checks) {
    if (!re.test(src)) fail(`toll_controller.tsx: ${msg}`);
  }

  // Every registered route relies on the blanket auth + org-context middleware.
  const routeCount = [...src.matchAll(/app\.(get|post|put|patch|delete)\(/g)].length;
  if (routeCount < 40) {
    fail(`toll_controller.tsx: expected ~61 routes, found ${routeCount} (scan broken?)`);
  } else {
    console.log(`toll org-scope: scanned ${routeCount} route registrations`);
  }
}

if (failed) {
  console.error("toll org-scope check failed — restore org helpers / SQL predicates.");
  process.exit(1);
}
console.log("toll org-scope OK");
