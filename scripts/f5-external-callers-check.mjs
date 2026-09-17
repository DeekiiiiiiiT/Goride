#!/usr/bin/env node
/**
 * F5 pre-retire gate: external callers that will never decay on their own.
 *
 * Fails closed unless:
 *   1. docs/f5-external-callers.json has every caller status in {cleared, fixed}
 *   2. Latest soak-log day has no topOffender path matching any callers[].shimPathSuffix
 *      on make-server-37f42386 (inventory-driven — not Uber-only)
 *
 * Usage: node scripts/f5-external-callers-check.mjs
 * Exit 0 = clear; 1 = blocked.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CALLERS = path.join(ROOT, "docs/f5-external-callers.json");
const SOAK = path.join(ROOT, "docs/f5-soak-log.json");
const OK = new Set(["cleared", "fixed"]);
const SHIM = "make-server-37f42386";

/** True when offender path is on the shim and includes the inventory suffix. */
function matchesShimSuffix(offenderPath, suffix) {
  const p = String(offenderPath || "");
  const s = String(suffix || "").trim();
  if (!p || !s) return false;
  if (!p.includes(SHIM)) return false;
  return p.includes(s);
}

function main() {
  if (!fs.existsSync(CALLERS)) {
    console.error(`Missing ${path.relative(ROOT, CALLERS)}`);
    process.exit(1);
  }
  const doc = JSON.parse(fs.readFileSync(CALLERS, "utf8"));
  const list = Array.isArray(doc.callers) ? doc.callers : [];
  const pending = list.filter((c) => !OK.has(String(c.status || "").toLowerCase()));
  if (pending.length) {
    console.error("External callers still open (must be cleared|fixed before retire):");
    for (const c of pending) {
      console.error(`  - ${c.id}  status=${c.status}  owner=${c.owner || "?"}`);
      if (c.targetUrl) console.error(`    target: ${c.targetUrl}`);
      if (c.note) console.error(`    note: ${c.note}`);
    }
    process.exit(1);
  }
  console.log(`ok  external callers inventory: ${list.length} cleared/fixed`);

  if (fs.existsSync(SOAK)) {
    const soak = JSON.parse(fs.readFileSync(SOAK, "utf8"));
    const days = Array.isArray(soak.days) ? soak.days : [];
    const latest = days[days.length - 1];
    const offenders = Array.isArray(latest?.topOffenders) ? latest.topOffenders : [];
    const withSuffix = list.filter((c) => String(c.shimPathSuffix || "").trim());
    const hits = [];
    for (const c of withSuffix) {
      const matched = offenders.filter((o) =>
        matchesShimSuffix(o.path, c.shimPathSuffix),
      );
      for (const o of matched) {
        hits.push({ id: c.id, suffix: c.shimPathSuffix, requests: o.requests, path: o.path });
      }
    }
    if (hits.length) {
      console.error(
        "Abort: latest soak topOffenders still include inventory shimPathSuffix on the shim — re-point before retire:",
      );
      for (const h of hits) {
        console.error(`  ${h.id} (${h.suffix})  ${h.requests}\t${h.path}`);
      }
      process.exit(1);
    }
    console.log(
      `ok  soak ${latest?.date || "?"}: no inventory shimPathSuffix in topOffenders (${withSuffix.length} suffixes checked)`,
    );
  } else {
    console.warn("warn  soak log missing — inventory check only");
  }

  process.exit(0);
}

main();
