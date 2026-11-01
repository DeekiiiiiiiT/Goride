/**
 * Append design-board / fixture-only labels to sample-labels.json.
 * Do not add shipped UI copy (footer, overlay rows, keyboard hints) — see clean-fp3-sample-labels.mjs / audit O4.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const path = join(import.meta.dirname, "..", "docs", "stitch", "roam-fleet-app", "sample-labels.json");
const j = JSON.parse(readFileSync(path, "utf8"));

function add(key, text) {
  const lines = text.split("|").map((s) => s.trim()).filter(Boolean);
  const seen = new Set((j[key] || []).map((l) => String(l).trim().toLowerCase()));
  const next = [...(j[key] || [])];
  for (const line of lines) {
    const k = line.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    next.push(line);
  }
  j[key] = next;
}

add(
  "FP3",
  "roomy|pre-facelift|1kr-fe|5179 kz|m900a|staging bay #03|chassis: m900a-012948 · front solid disc / rear drum setup confirmed",
);

add(
  "FP3d",
  "5179 kz|fleet-root|jamaica-dispatch|m-spec-v4|sys-latency: 14ms|specimen dual-view|tier-1 ingest|996cc|jm-04|m900a-0182741",
);

writeFileSync(path, `${JSON.stringify(j, null, 2)}\n`);
console.log("patched sample-labels.json (fixture-only)");
