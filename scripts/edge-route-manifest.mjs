/**
 * Emit routes.generated.json for an edge function slug by grepping its entry + mounted controllers.
 * Usage:
 *   node scripts/edge-route-manifest.mjs <slug>
 *   node scripts/edge-route-manifest.mjs <slug> --check
 *   node scripts/edge-route-manifest.mjs --all [--check]
 *
 * --check: regenerate in memory and fail if committed manifest drifts (D15).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectRoutesFromEntry } from "./edge-route-collect.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FLEET_SLUGS = [
  "fleet-fuel",
  "fleet-toll",
  "fleet-ops",
  "fleet-claims",
  "fleet-pay",
  "fleet-core",
];

const args = process.argv.slice(2);
const checkMode = args.includes("--check");
const allMode = args.includes("--all");
const slugArg = args.find((a) => !a.startsWith("--"));

function findEntry(slug) {
  const entryCandidates = [
    path.join(ROOT, "supabase/functions", slug, "src", "main.ts"),
    path.join(ROOT, "supabase/functions", slug, "index.ts"),
  ];
  return entryCandidates.find((p) => fs.existsSync(p)) ?? null;
}

function buildPayload(slug, routes) {
  return {
    slug,
    generatedAt: new Date().toISOString(),
    routeCount: routes.length,
    routes,
  };
}

/** Compare route sets only (ignore generatedAt drift). */
function routesEqual(a, b) {
  if (!a || !b) return false;
  if (!Array.isArray(a.routes) || !Array.isArray(b.routes)) return false;
  if (a.routes.length !== b.routes.length) return false;
  for (let i = 0; i < a.routes.length; i++) {
    if (a.routes[i] !== b.routes[i]) return false;
  }
  return true;
}

function processSlug(slug) {
  const entry = findEntry(slug);
  if (!entry) {
    console.error(`No entry for ${slug}`);
    return 1;
  }
  const routes = collectRoutesFromEntry(entry, slug);
  const outPath = path.join(ROOT, "supabase/functions", slug, "routes.generated.json");
  const payload = buildPayload(slug, routes);

  if (checkMode) {
    if (!fs.existsSync(outPath)) {
      console.error(`FAIL ${slug}: missing committed manifest ${outPath}`);
      return 1;
    }
    const committed = JSON.parse(fs.readFileSync(outPath, "utf8"));
    if (!routesEqual(committed, payload)) {
      console.error(
        `FAIL ${slug}: routes.generated.json is stale (committed ${committed.routeCount}, actual ${payload.routeCount}). Re-run without --check and commit.`,
      );
      return 1;
    }
    console.log(`ok  ${slug} manifest (${routes.length} routes)`);
    return 0;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`Wrote ${outPath} (${routes.length} routes)`);
  return 0;
}

const slugs = allMode ? FLEET_SLUGS : slugArg ? [slugArg] : null;
if (!slugs) {
  console.error(
    "Usage: node scripts/edge-route-manifest.mjs <slug|--all> [--check]",
  );
  process.exit(1);
}

let exitCode = 0;
for (const slug of slugs) {
  exitCode = Math.max(exitCode, processSlug(slug));
}
process.exit(exitCode);
