#!/usr/bin/env node
/**
 * Triple-lock: TS (via .mjs port) ↔ SQL mirror ↔ fixture expectations.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isSettlementParticipantTransaction } from "./lib/settlementParticipant.mjs";
import { sqlSettlementParticipantPredicate } from "./lib/settlementParticipantSql.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(root, "scripts/fixtures/settlement_participant_samples.json");
const samples = JSON.parse(readFileSync(fixturePath, "utf8"));

let failed = 0;

for (const sample of samples) {
  const tx = {
    type: sample.type,
    category: sample.category,
    amount: sample.amount,
    description: sample.description,
    paymentMethod: sample.paymentMethod,
  };
  const js = isSettlementParticipantTransaction(tx);
  const sql = sqlSettlementParticipantPredicate({
    cat: sample.category,
    typ: sample.type,
    descr: sample.description,
    pm: sample.paymentMethod,
    amt: sample.amount,
  });
  const expect = !!sample.expect;

  if (js !== expect) {
    console.error(`[${sample.id}] JS mismatch: got ${js}, expected ${expect}`);
    failed++;
  }
  if (sql !== expect) {
    console.error(`[${sample.id}] SQL mirror mismatch: got ${sql}, expected ${expect}`);
    failed++;
  }
  if (js !== sql) {
    console.error(`[${sample.id}] JS vs SQL: ${js} !== ${sql}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} predicate parity failure(s)`);
  process.exit(1);
}

console.log(`[predicate-parity] ${samples.length} fixtures OK (JS + SQL mirror)`);
