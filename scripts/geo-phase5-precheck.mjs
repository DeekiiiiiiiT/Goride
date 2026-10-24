/**
 * Fails if app code still names the old border table.
 * Run this before scripts/geo-phase5-contract.sql. Migrations may still mention the name.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["supabase/functions", "packages", "apps"];
const needle = "admin_boundaries";
const skip = new Set(["node_modules", "dist", ".turbo"]);
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|sql)$/.test(name)) continue;
    const text = readFileSync(path, "utf8");
    if (text.includes(needle)) hits.push(path.replaceAll("\\", "/"));
  }
}

for (const root of roots) walk(root);

if (hits.length) {
  console.error(`${needle} is still used:\n${hits.join("\n")}`);
  process.exit(1);
}

console.log(`${needle} is gone from supabase/functions, packages, and apps.`);
