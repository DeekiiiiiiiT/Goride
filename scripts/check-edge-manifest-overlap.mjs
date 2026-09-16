/**
 * D15: fail if any fleet-* domain route path is also served live on the monolith.
 * Ignores intentional 410 tombstones (handler returns moved / useEndpoint).
 *
 * Usage: node scripts/check-edge-manifest-overlap.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectRoutesFromFile } from "./edge-route-collect.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FLEET_SLUGS = ["fleet-fuel", "fleet-toll", "fleet-ops", "fleet-claims", "fleet-pay"];
const FLEET_SERVER = path.join(ROOT, "supabase/functions/_fleet-server");

const ROUTE_RE =
  /\.(get|post|put|patch|delete|all)\(\s*[`"']([^`"']+)[`"']/gi;

/** Strip METHOD prefix → path only for intersection. */
function pathOnly(methodPath) {
  const sp = methodPath.indexOf(" ");
  return sp >= 0 ? methodPath.slice(sp + 1) : methodPath;
}

/**
 * Normalize for comparison: drop function slug prefixes so
 * /fleet-fuel/foo and /make-server-37f42386/foo can compare on /foo.
 */
function normalizePath(p) {
  let s = p;
  for (const prefix of [
    "/make-server-37f42386",
    "/fleet-fuel",
    "/fleet-toll",
    "/fleet-ops",
    "/fleet-claims",
    "/fleet-pay",
    "/fleet-core",
  ]) {
    if (s === prefix || s.startsWith(prefix + "/")) {
      s = s.slice(prefix.length) || "/";
      break;
    }
  }
  return s;
}

/** Paths whose boot handlers are explicit 410 tombstones (moved). */
function collectTombstonePaths(file) {
  const tombs = new Set();
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    return tombs;
  }
  // Match route registrations whose nearby body mentions 410 + moved/useEndpoint
  const chunks = src.split(/(?=app\.(get|post|put|patch|delete|all)\()/);
  for (const chunk of chunks) {
    const m = chunk.match(
      /^app\.(get|post|put|patch|delete|all)\(\s*[`"']([^`"']+)[`"']/,
    );
    if (!m) continue;
    const head = chunk.slice(0, 800);
    if (
      /\b410\b/.test(head) &&
      /(moved|useEndpoint|RETIRED)/i.test(head)
    ) {
      tombs.add(normalizePath(m[2]));
    }
  }
  return tombs;
}

function collectMonolithRoutes() {
  const routes = new Set();
  const tombs = new Set();

  const boot = path.join(FLEET_SERVER, "make_server_legacy_boot.tsx");
  if (fs.existsSync(boot)) {
    for (const r of collectRoutesFromFile(boot)) routes.add(r);
    for (const t of collectTombstonePaths(boot)) tombs.add(t);
  }

  for (const name of fs.readdirSync(FLEET_SERVER)) {
    if (!name.startsWith("register_") || !/\.tsx?$/.test(name)) continue;
    const file = path.join(FLEET_SERVER, name);
    for (const r of collectRoutesFromFile(file)) routes.add(r);
    for (const t of collectTombstonePaths(file)) tombs.add(t);
  }

  return { routes, tombs };
}

function loadManifest(slug) {
  const p = path.join(ROOT, "supabase/functions", slug, "routes.generated.json");
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${p} — run edge-route-manifest.mjs ${slug}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const { routes: monoRoutes, tombs } = collectMonolithRoutes();
const monoNorm = new Map(); // normalized path → [METHOD path, ...]
for (const r of monoRoutes) {
  const n = normalizePath(pathOnly(r));
  if (tombs.has(n)) continue; // intentional 410 — not live overlap
  if (!monoNorm.has(n)) monoNorm.set(n, []);
  monoNorm.get(n).push(r);
}

let failed = 0;
const overlaps = [];

for (const slug of FLEET_SLUGS) {
  const manifest = loadManifest(slug);
  for (const r of manifest.routes || []) {
    const n = normalizePath(pathOnly(r));
    if (n === "/" || n === "/health" || n === "/ready") continue;
    if (monoNorm.has(n)) {
      overlaps.push({ slug, domainRoute: r, monolithRoutes: monoNorm.get(n) });
    }
  }
}

if (overlaps.length) {
  failed = 1;
  console.error(`FAIL D15: ${overlaps.length} path(s) served by both domain fn and monolith:\n`);
  for (const o of overlaps.slice(0, 50)) {
    console.error(`  ${o.slug}: ${o.domainRoute}`);
    console.error(`    also on monolith: ${o.monolithRoutes.join(", ")}`);
  }
  if (overlaps.length > 50) {
    console.error(`  … and ${overlaps.length - 50} more`);
  }
} else {
  console.log(
    `ok  D15 overlap: 0 live collisions (monolith ${monoRoutes.size} routes, ${tombs.size} tombstones ignored)`,
  );
  // Intentional soak dual-door: fleet-core mounts the same residual registrar as
  // make-server-37f42386, so it is excluded from FLEET_SLUGS until the shim is retired.
  console.log(
    `note D15: fleet-core excluded (intentional dual-serve with make-server-37f42386 during soak)`,
  );
}

process.exit(failed);
