/**
 * Shared route grepping for edge manifests / D15 overlap (no CLI side effects).
 */
import fs from "node:fs";
import path from "node:path";

const ROUTE_RE =
  /\.(get|post|put|patch|delete|all)\(\s*[`"']([^`"']+)[`"']/gi;
const IMPORT_RE =
  /from\s+["'](\.\.?\/[^"']+)["']/g;

export function collectRoutesFromEntry(entry, slug) {
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
      const routePath = m[2];
      // Real Hono routes: /path or `${BASE_PATH}/path`. Skip Deno.env.get / kv.get / c.get.
      if (!routePath.includes("/")) continue;
      routes.add(`${m[1].toUpperCase()} ${routePath}`);
    }
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
  return [...routes].sort();
}

/** Collect METHOD path routes from a single source file (no import walk). */
export function collectRoutesFromFile(file) {
  const routes = new Set();
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  for (const m of src.matchAll(ROUTE_RE)) {
    const routePath = m[2];
    if (!routePath.includes("/")) continue;
    routes.add(`${m[1].toUpperCase()} ${routePath}`);
  }
  return [...routes];
}
