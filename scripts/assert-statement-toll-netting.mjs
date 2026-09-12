#!/usr/bin/env node
/**
 * Statement Summary toll class guard.
 * Platform statement must NOT treat plaza P&L washes as cash reimbursements,
 * and must not frame Uber CSV credits as "charges $0 + reimbursements".
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const route = join(
  root,
  "supabase/functions/_fleet-server/ledger_query_summary_routes.ts",
);
const netting = join(root, "packages/finance-core/src/statementTollNetting.ts");
const card = join(
  root,
  "apps/fleet/src/components/finance/StatementSummaryCard.tsx",
);
const combined = join(
  root,
  "apps/fleet/src/components/finance/PlatformStatementSummary.tsx",
);

const routeText = await readFile(route, "utf8");
const nettingText = await readFile(netting, "utf8");
const cardText = await readFile(card, "utf8");
const combinedText = await readFile(combined, "utf8");
let failed = false;

if (!routeText.includes("presentStatementToll")) {
  console.error("[statement] must call presentStatementToll");
  failed = true;
}
if (!routeText.includes("applyStatementTollEvent")) {
  console.error("[statement] must use applyStatementTollEvent");
  failed = true;
}
if (!routeText.includes("fleetTollSnapshot") || !routeText.includes("buildFleetTollSnapshotForRange")) {
  console.error("[statement] must attach fleetTollSnapshot from Recon engines");
  failed = true;
}
if (/totalRefundsExpenses:\s*Number\(\(tolls\s*\+\s*tollAdjustments\)/.test(routeText)) {
  console.error("[statement] forbidden: totalRefundsExpenses = tolls + tollAdjustments");
  failed = true;
}
if (!nettingText.includes("sourceType") || !/transaction/.test(nettingText)) {
  console.error("[statement] must exclude plaza toll_charge sourceType=transaction");
  failed = true;
}
if (!/case ['"]toll_charge_offset['"]:\s*[\s\S]*?return null/.test(nettingText)) {
  console.error("[statement] must ignore toll_charge_offset (internal P&L wash)");
  failed = true;
}
if (!nettingText.includes("reimbursedTripIds")) {
  console.error("[statement] must dedupe Uber support_adjustment vs toll_reimbursement");
  failed = true;
}
if (!nettingText.includes("uber_csv_credits") || !nettingText.includes("presentStatementToll")) {
  console.error("[statement] must present uber_csv_credits tollStory");
  failed = true;
}
// UI must not show the free-money layout
if (/label=["']Toll Charges["']/.test(cardText) && /label=["']Toll Reimbursements["']/.test(cardText)) {
  console.error("[statement] UI must not show Toll Charges + Toll Reimbursements composition");
  failed = true;
}
if (!cardText.includes("Uber toll credits") && !cardText.includes("uber_csv_credits")) {
  console.error("[statement] Uber card must show CSV toll credits story");
  failed = true;
}
if (/Total Expenses/.test(combinedText) && /totalRefundsExpenses/.test(combinedText)) {
  console.error("[statement] Combined Totals must not sum platform net toll expenses");
  failed = true;
}
if (!combinedText.includes("Fleet toll snapshot") || !combinedText.includes("fleetTollSnapshot")) {
  console.error("[statement] Combined strip must show fleet toll snapshot");
  failed = true;
}

if (failed) {
  console.error("assert-statement-toll-netting: FAILED");
  process.exit(1);
}
console.log("assert-statement-toll-netting: OK");
