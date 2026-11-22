#!/usr/bin/env node
/**
 * Unused-file check (fuel enterprise audit F-27).
 *
 * Builds the import graph of the Fleet app and fails when a source file in a
 * guarded folder is imported by nothing. A file counts as used when it is
 * reachable from:
 *   - the Fleet entry (apps/fleet/src/main.tsx),
 *   - any test file (*.test.ts / *.test.tsx / *.spec.ts),
 *   - any file in another app or package that imports into the Fleet app
 *     (the driver and enterprise apps borrow Fleet files through "@fleet/...").
 *
 * Imports followed: static `import … from`, `export … from`, side-effect
 * `import '…'`, dynamic `import('…')` and `vi.mock('…')`, through relative
 * paths and the "@/" and "@fleet/" aliases.
 *
 *   node scripts/check-unused-files.mjs          → fail on unused files in guarded folders
 *   node scripts/check-unused-files.mjs --list   → also list unused files outside them (report only)
 *
 * To guard another folder, add it to GUARDED.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const FLEET_SRC = join(ROOT, 'apps', 'fleet', 'src');

/** Folders where an unused file fails the check (repo-relative, forward slashes). */
const GUARDED = ['apps/fleet/src/components/fuel/', 'apps/fleet/src/components/driver-portal/'];

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.deno', 'coverage']);

const rel = (p) => relative(ROOT, p).split(sep).join('/');
const isSource = (p) => EXTS.some((e) => p.endsWith(e)) && !p.endsWith('.d.ts');
const isTest = (p) => /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(p);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (isSource(p)) out.push(p);
  }
  return out;
}

function resolveFile(base) {
  const cands = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, 'index' + e))];
  for (const c of cands) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

function resolveSpec(spec, fromFile) {
  if (spec.startsWith('.')) return resolveFile(resolve(dirname(fromFile), spec));
  if (spec.startsWith('@fleet/')) return resolveFile(join(FLEET_SRC, spec.slice('@fleet/'.length)));
  // "@/" means the importing app's own src folder.
  if (spec.startsWith('@/')) {
    const m = rel(fromFile).match(/^(apps\/[^/]+\/src)\//);
    if (m) return resolveFile(join(ROOT, m[1], spec.slice(2)));
  }
  return null;
}

const IMPORT_RE =
  /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|vi\.mock\(\s*['"]([^'"]+)['"]/g;

const depsCache = new Map();
function deps(file) {
  if (depsCache.has(file)) return depsCache.get(file);
  const src = readFileSync(file, 'utf8');
  const out = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3] || m[4];
    const r = resolveSpec(spec, file);
    if (r) out.push(r);
  }
  depsCache.set(file, out);
  return out;
}

const fleetFiles = walk(FLEET_SRC);
const otherFiles = [
  ...walk(join(ROOT, 'apps')).filter((p) => !p.startsWith(FLEET_SRC)),
  ...walk(join(ROOT, 'packages')),
  ...walk(join(ROOT, 'e2e')),
];

const roots = [join(FLEET_SRC, 'main.tsx'), ...fleetFiles.filter(isTest), ...otherFiles];
const seen = new Set();
const stack = [...roots.filter((p) => existsSync(p))];
while (stack.length) {
  const f = stack.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  for (const d of deps(f)) if (!seen.has(d)) stack.push(d);
}

const unused = fleetFiles.filter((f) => !seen.has(f)).map(rel).sort();
const guarded = unused.filter((f) => GUARDED.some((g) => f.startsWith(g)));

if (process.argv.includes('--list')) {
  const other = unused.filter((f) => !guarded.includes(f));
  console.log(`Unused Fleet files outside the guarded folders (report only): ${other.length}`);
  for (const f of other) console.log(`  ${f}`);
  console.log('');
}

if (guarded.length) {
  console.log(`check-unused-files: ${guarded.length} file(s) nothing imports, in a guarded folder:`);
  for (const f of guarded) console.log(`  ${f}`);
  console.log('\nDelete them, or import them where they are used.');
  process.exit(1);
}
console.log(`check-unused-files: OK (${fleetFiles.length} Fleet files, guarded: ${GUARDED.join(', ')})`);
