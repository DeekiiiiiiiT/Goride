#!/usr/bin/env node
/**
 * R-3 guard — settlement money catch paths must never call saveTransaction.
 * Intentional float/adjustment writes outside catch blocks are allowed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(
  root,
  "apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx",
);

const src = readFileSync(target, "utf8");
const catchRe = /\bcatch\s*\([^)]*\)\s*\{/g;
const failures = [];
let m;
while ((m = catchRe.exec(src)) !== null) {
  const openBrace = m.index + m[0].lastIndexOf("{");
  let depth = 0;
  let i = openBrace;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const body = src.slice(openBrace, i);
  if (/\.saveTransaction\s*\(/.test(body) || /\bsaveTransaction\s*\(/.test(body)) {
    const line = src.slice(0, m.index).split(/\r?\n/).length;
    failures.push(`DriverSettlementsPage.tsx:${line}: saveTransaction inside catch block`);
  }
}

if (failures.length) {
  console.error("assert-no-settlement-saveTransaction-fallback: FAIL");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("assert-no-settlement-saveTransaction-fallback: OK");
