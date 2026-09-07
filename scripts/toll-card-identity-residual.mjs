#!/usr/bin/env node
/**
 * Phase 0 characterization — Toll Reconciliation four-card identity residual.
 *
 * For each week, checks the accounting identity that a closed week must satisfy:
 *   residual = Spend − Reimbursed − ChargedToDrivers − NetTollLoss  ≈ 0
 * (see RECONCILIATION_SYSTEM_AUDIT.md headline problem #2). Any non-zero
 * residual is an unexplained gap between the two engines behind the cards.
 *
 * Canonical pure math lives in packages/toll-core/src/tollCardIdentity.ts
 * (computeTollCardIdentityResidual). This script mirrors that logic so it can
 * run under plain node, and documents how to feed it weekly card values.
 *
 * INPUT — an array of weeks, each:
 *   { week, tollSpend, reimbursed, chargedToDrivers, netTollLoss }
 * provided via either:
 *   1. a JSON file path arg:   node scripts/toll-card-identity-residual.mjs weeks.json
 *   2. stdin:                  cat weeks.json | node scripts/toll-card-identity-residual.mjs
 *
 * TODO(parent agent): if the four card values become queryable from SQL
 * (ledger.* toll aggregates per week), wire a read-only Supabase SELECT here
 * using the same env as scripts/finance-recon.mjs and build the weeks array.
 * Read-only: this script performs NO writes.
 */
import { readFile } from "node:fs/promises";

const EPS = 0.01;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Mirror of computeTollCardIdentityResidual (packages/toll-core/src/tollCardIdentity.ts).
function computeTollCardIdentityResidual(
  { tollSpend, reimbursed, chargedToDrivers, netTollLoss },
  eps = EPS,
) {
  const residual = round2(
    num(tollSpend) - num(reimbursed) - num(chargedToDrivers) - num(netTollLoss),
  );
  return { residual, closes: Math.abs(residual) <= eps };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function loadWeeks() {
  const arg = process.argv[2];
  const raw = arg ? await readFile(arg, "utf8") : await readStdin();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.rows || parsed.weeks || [];
}

const weeks = await loadWeeks();
if (!weeks.length) {
  console.error(
    "No weeks provided. Pass a JSON file path or pipe JSON to stdin: " +
      '[{ "week": "2026-09-01", "tollSpend": 0, "reimbursed": 0, "chargedToDrivers": 0, "netTollLoss": 0 }]',
  );
  process.exit(1);
}

let open = 0;
const results = weeks.map((w) => {
  const { residual, closes } = computeTollCardIdentityResidual(w);
  if (!closes) open += 1;
  return { week: w.week ?? w.period_anchor ?? "(unknown)", ...w, residual, closes };
});

console.log(JSON.stringify({ eps: EPS, weekCount: results.length, openWeeks: open, results }, null, 2));
process.exit(open > 0 ? 3 : 0);
