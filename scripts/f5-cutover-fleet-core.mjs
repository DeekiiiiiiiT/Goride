#!/usr/bin/env node
/**
 * F5 Phase 2: point residual client bases at fleet-core and sweep .fleet → .fleetCore.
 * Idempotent. Does not touch extracted domain keys (fuel/toll/fleetOps/claims/fleetPay).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CONFIGS = [
  "packages/api-client/src/config.ts",
  "apps/fleet/src/services/apiConfig.ts",
  "apps/admin/src/services/apiConfig.ts",
  "apps/driver/src/services/apiConfig.ts",
];

function patchConfig(filePath) {
  const abs = path.join(ROOT, filePath);
  let t = fs.readFileSync(abs, "utf8");
  const before = t;

  // Insert fleetCore if missing (after opening of API_ENDPOINTS)
  if (!/\bfleetCore\s*:/.test(t)) {
    t = t.replace(
      /(export const API_ENDPOINTS = \{\s*\n)/,
      `$1  fleetCore: \`\${BASE_URL}/fleet-core\`,\n`,
    );
  }

  // Residual keys → fleet-core
  for (const key of ["fleet", "financial", "admin", "ai", "driver"]) {
    const re = new RegExp(
      `(${key}\\s*:\\s*\`\\$\\{BASE_URL\\}/)make-server-37f42386(\`)`,
      "g",
    );
    t = t.replace(re, `$1fleet-core$2`);
  }

  // Also catch any leftover make-server base in these config files
  t = t.replaceAll("${BASE_URL}/make-server-37f42386", "${BASE_URL}/fleet-core");

  if (t !== before) {
    fs.writeFileSync(abs, t);
    console.log("config", filePath);
  } else {
    console.log("config unchanged", filePath);
  }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === ".git") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function sweepFleetToFleetCore() {
  const roots = [
    path.join(ROOT, "apps"),
    path.join(ROOT, "packages"),
  ];
  let files = 0;
  let hits = 0;
  for (const root of roots) {
    for (const file of walk(root)) {
      // Keep apiConfig / packages config for fleet: key (already points at fleet-core)
      let t = fs.readFileSync(file, "utf8");
      if (!t.includes("API_ENDPOINTS.fleet")) continue;
      const next = t.replace(/\bAPI_ENDPOINTS\.fleet\b/g, "API_ENDPOINTS.fleetCore");
      if (next !== t) {
        fs.writeFileSync(file, next);
        files++;
        hits += (t.match(/\bAPI_ENDPOINTS\.fleet\b/g) || []).length;
        console.log("sweep", path.relative(ROOT, file));
      }
    }
  }
  console.log(`swept ${hits} call site(s) in ${files} file(s)`);
}

function rewriteHardcodedMakeServer() {
  const targets = walk(path.join(ROOT, "apps")).concat(walk(path.join(ROOT, "packages")));
  let n = 0;
  for (const file of targets) {
    // Skip deprecated local supabase stubs / docs-like strings that are comments only if needed
    let t = fs.readFileSync(file, "utf8");
    if (!t.includes("make-server-37f42386")) continue;
    // Client runtime URLs only — leave server route registrations alone (not under apps/packages residual)
    if (file.includes(`${path.sep}supabase${path.sep}functions${path.sep}`)) continue;
    const next = t.replaceAll(
      "/functions/v1/make-server-37f42386",
      "/functions/v1/fleet-core",
    );
    if (next !== t) {
      fs.writeFileSync(file, next);
      n++;
      console.log("hardcoded", path.relative(ROOT, file));
    }
  }
  console.log(`rewrote hardcoded make-server URLs in ${n} file(s)`);
}

for (const c of CONFIGS) patchConfig(c);
sweepFleetToFleetCore();
rewriteHardcodedMakeServer();
console.log("done");
