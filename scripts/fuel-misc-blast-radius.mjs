#!/usr/bin/env node
/**
 * Phase 0 characterization — fuel "misc" blast radius.
 *
 * Flags fuel weeks where the miscellaneous residual is too large relative to
 * total spend (|misc| > ratio × totalSpend, default ratio 0.25). A large misc
 * means the categorization does not add up and the leftover is being split as
 * real cash — see RECONCILIATION_SYSTEM_AUDIT.md headline problem #1.
 *
 * Canonical pure math lives in packages/fuel-core/src/fuelFinalizeGate.ts
 * (isOverExplainedFuelWeek). This script mirrors that logic so it can run under
 * plain node, and reports how many weeks would be gated.
 *
 * INPUT — an array of weeks, each:
 *   { week, totalSpend, miscellaneousCost }
 * provided via either:
 *   1. a JSON file path arg:   node scripts/fuel-misc-blast-radius.mjs weeks.json
 *   2. stdin:                  cat weeks.json | node scripts/fuel-misc-blast-radius.mjs
 *
 * Read-only: this script performs NO writes.
 */
import { readFile } from "node:fs/promises";

const DEFAULT_RATIO = 0.25;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Mirror of isOverExplainedFuelWeek (packages/fuel-core/src/fuelFinalizeGate.ts).
function isOverExplainedFuelWeek(totalSpend, miscellaneousCost, ratio = DEFAULT_RATIO) {
  const spend = num(totalSpend);
  const misc = num(miscellaneousCost);
  if (spend <= 0) return misc !== 0;
  return Math.abs(misc) > ratio * spend;
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
      '[{ "week": "2026-09-01", "totalSpend": 0, "miscellaneousCost": 0 }]',
  );
  process.exit(1);
}

let flagged = 0;
const results = weeks.map((w) => {
  const overExplained = isOverExplainedFuelWeek(w.totalSpend, w.miscellaneousCost, DEFAULT_RATIO);
  if (overExplained) flagged += 1;
  const spend = num(w.totalSpend);
  return {
    week: w.week ?? w.period_anchor ?? "(unknown)",
    totalSpend: spend,
    miscellaneousCost: num(w.miscellaneousCost),
    miscRatio: spend > 0 ? Math.abs(num(w.miscellaneousCost)) / spend : null,
    overExplained,
  };
});

console.log(
  JSON.stringify({ ratio: DEFAULT_RATIO, weekCount: results.length, flaggedWeeks: flagged, results }, null, 2),
);
process.exit(flagged > 0 ? 3 : 0);
