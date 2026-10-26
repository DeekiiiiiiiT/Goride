/**
 * Files under apps/admin/src that no screen can load.
 * Starts at main.tsx and follows relative imports. Tests and components/ui are excluded.
 * Run: node scripts/admin-reachability.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/admin/src');
const start = path.join(root, 'main.tsx');
const exts = ['.ts', '.tsx', '.css', '.js', '.jsx', '.mjs'];
const seen = new Set();

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  const candidates = [
    base,
    ...exts.map((ext) => base + ext),
    ...exts.map((ext) => path.join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function walk(file) {
  const norm = path.normalize(file);
  if (seen.has(norm) || !fs.existsSync(norm) || !fs.statSync(norm).isFile()) return;
  seen.add(norm);
  const text = fs.readFileSync(norm, 'utf8');
  const re = /from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let match;
  while ((match = re.exec(text))) {
    const spec = match[1] || match[2] || match[3];
    const next = resolveImport(norm, spec);
    if (next) walk(next);
  }
}

function allFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      allFiles(full, out);
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(ent.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(ent.name) || ent.name.endsWith('.d.ts')) continue;
    if (full.includes(`${path.sep}components${path.sep}ui${path.sep}`)) continue;
    out.push(full);
  }
  return out;
}

walk(start);
const unreachable = allFiles(root)
  .filter((file) => !seen.has(path.normalize(file)))
  .map((file) => path.relative(root, file).replaceAll('\\', '/'))
  .sort();

console.log(`reached ${seen.size}`);
console.log(`unreachable ${unreachable.length}`);
for (const file of unreachable) console.log(file);
process.exitCode = unreachable.length > 0 ? 1 : 0;
