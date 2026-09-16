/**
 * Emit routes.generated.json for an edge function slug by grepping its entry + mounted controllers.
 * Usage: node scripts/edge-route-manifest.mjs <slug>
 * CI: fail if committed manifest is stale (git diff --exit-code).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/edge-route-manifest.mjs <slug>");
  process.exit(1);
}

const entryCandidates = [
  path.join(ROOT, "supabase/functions", slug, "src", "main.ts"),
  path.join(ROOT, "supabase/functions", slug, "index.ts"),
];
const entry = entryCandidates.find((p) => fs.existsSync(p));
if (!entry) {
  console.error(`No entry for ${slug}`);
  process.exit(1);
}

const ROUTE_RE =
  /\.(get|post|put|patch|delete|all)\(\s*[`"']([^`"']+)[`"']/gi;
const IMPORT_RE =
  /from\s+["'](\.\.?\/[^"']+)["']/g;

const visited = new Set();
const routes = new Set();

function resolveImport(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

function walk(file, depth = 0) {
  if (depth > 8 || visited.has(file)) return;
  visited.add(file);
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const m of src.matchAll(ROUTE_RE)) {
    routes.add(`${m[1].toUpperCase()} ${m[2]}`);
  }
  // Follow relative imports into _fleet-server for this slug's graph only
  for (const m of src.matchAll(IMPORT_RE)) {
    const resolved = resolveImport(file, m[1]);
    if (!resolved) continue;
    if (
      resolved.includes(`${path.sep}_fleet-server${path.sep}`) ||
      resolved.includes(`${path.sep}${slug}${path.sep}`) ||
      resolved.includes(`${path.sep}_shared${path.sep}`)
    ) {
      walk(resolved, depth + 1);
    }
  }
}

walk(entry);

const outDir = path.join(ROOT, "supabase/functions", slug);
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "routes.generated.json");
const payload = {
  slug,
  generatedAt: new Date().toISOString(),
  routeCount: routes.size,
  routes: [...routes].sort(),
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
console.log(`Wrote ${outPath} (${routes.size} routes)`);
