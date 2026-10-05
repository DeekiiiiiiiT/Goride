/**
 * Fail CI when a browser service calls a path the target edge function does not serve.
 * Reads each slug's routes.generated.json. ${BASE} routes match by their static suffix
 * because the prefix is a file-local constant (toll-reconciliation, dispute-refunds, …).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CALL_RE = /\$\{API_ENDPOINTS\.([A-Za-z0-9_]+)\}\/([^`"'\n]+)/g;
const EMPTY_VARS = [
  "TOLL_HTTP_PREFIX",
  "PAY_HTTP_PREFIX",
  "FUEL_HTTP_PREFIX",
  "CLAIMS_HTTP_PREFIX",
  "OPS_HTTP_PREFIX",
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function serviceFiles() {
  const files = [];
  const apps = path.join(ROOT, "apps");
  if (fs.existsSync(apps)) {
    for (const app of fs.readdirSync(apps)) {
      files.push(...walk(path.join(apps, app, "src", "services")));
    }
  }
  const packages = path.join(ROOT, "packages");
  if (fs.existsSync(packages)) {
    for (const pkg of fs.readdirSync(packages)) {
      files.push(...walk(path.join(packages, pkg, "src", "services")));
    }
  }
  return files;
}

function endpointMap(file) {
  const src = fs.readFileSync(file, "utf8");
  const map = {};
  for (const m of src.matchAll(/([A-Za-z0-9_]+):\s*`\$\{BASE_URL\}\/([a-z0-9-]+)`/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

function configFor(file) {
  const rel = path.relative(ROOT, file).replaceAll("\\", "/");
  const app = rel.match(/^apps\/([^/]+)\//);
  if (app) {
    const local = path.join(ROOT, "apps", app[1], "src", "services", "apiConfig.ts");
    if (fs.existsSync(local)) return endpointMap(local);
  }
  return endpointMap(path.join(ROOT, "packages", "api-client", "src", "config.ts"));
}

function normalizePath(raw) {
  let p = String(raw).split("?")[0];
  p = p.replace(/\$\{[^}]*$/g, "");
  p = p.replace(/(^|[^/])\$\{[^}]+\}/g, "$1");
  p = p.replace(/\$\{[^}]+\}/g, ":p");
  p = p.replace(/\/:[A-Za-z0-9_]+/g, "/:p");
  p = p.replace(/\/+/g, "/");
  if (p.length > 1) p = p.replace(/\/$/, "");
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

function expandRoute(routeLine) {
  let body = routeLine.replace(/^[A-Z]+\s+/, "");
  for (const name of EMPTY_VARS) body = body.split("${" + name + "}").join("");
  body = body.replace(/^\/make-server-37f42386/, "");
  const hasBase = body.includes("${BASE}");
  const suffix = normalizePath(body.split("${BASE}").join(""));
  return {
    concrete: hasBase ? null : normalizePath(body),
    suffix,
    hasBase,
  };
}

function usableSuffix(suffix) {
  if (!suffix || suffix === "/" || suffix === "/:p") return false;
  return suffix.split("/").some((part) => part && part !== ":p");
}

function matches(called, routes) {
  for (const route of routes) {
    const known = route.concrete || (route.hasBase ? route.suffix : null);
    if (!known || !usableSuffix(known)) continue;
    if (known === called || called.endsWith(known) || known.endsWith(called)) return true;
  }
  return false;
}

function loadManifest(slug) {
  const file = path.join(ROOT, "supabase", "functions", slug, "routes.generated.json");
  if (!fs.existsSync(file)) return null;
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  return (json.routes || []).map(expandRoute);
}

const manifests = new Map();
function servedBy(slug) {
  if (!manifests.has(slug)) manifests.set(slug, loadManifest(slug));
  return manifests.get(slug);
}

const failures = [];

for (const file of serviceFiles()) {
  const src = fs.readFileSync(file, "utf8");
  const endpoints = configFor(file);
  for (const m of src.matchAll(CALL_RE)) {
    const key = m[1];
    const slug = endpoints[key];
    if (!slug) continue;
    const served = servedBy(slug);
    if (!served) continue;
    const called = normalizePath(m[2]);
    if (called.includes("..") || called === "/") continue;
    // Toll inventory was the cutover that 404'd. Other families still share a
    // residual mount with fleet-core; failing those would be a false alarm.
    if (!/^\/(toll-tags|toll-plazas|toll-info)(\/|$)/.test(called)) continue;
    if (matches(called, served)) continue;
    failures.push(`${path.relative(ROOT, file)} → ${slug} ${called} (API_ENDPOINTS.${key})`);
  }
}

const tollRoutes = servedBy("fleet-toll");
const coreRoutes = servedBy("fleet-core");
if (!tollRoutes || !matches("/toll-tags", tollRoutes) || !matches("/toll-plazas", tollRoutes) || !matches("/toll-info", tollRoutes)) {
  failures.push("fleet-toll manifest is missing toll-tags, toll-plazas, or toll-info");
}
if (coreRoutes && (matches("/toll-tags", coreRoutes) || matches("/toll-plazas", coreRoutes) || matches("/toll-info", coreRoutes))) {
  failures.push("fleet-core still serves toll-tags, toll-plazas, or toll-info");
}

if (failures.length) {
  console.error(`FAIL client route contract (${failures.length}):`);
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}

console.log("client route contract: ok");
