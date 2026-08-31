/**
 * Fail CI if app TS still uses Figma-style `package@version` imports.
 * Vite aliases those; `tsc --noEmit` (fleet typecheck) does not.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const VERSIONED_IMPORT =
  /(?:from\s+|import\s*\(\s*)(['"])(@?[\w.-]+(?:\/[\w.-]+)*)@\d+\.[^'"]+\1/g;

const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'supabase',
  'coverage',
]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}

const roots = [join(ROOT, 'apps/fleet/src'), join(ROOT, 'apps/admin/src')];
const hits = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    VERSIONED_IMPORT.lastIndex = 0;
    let m;
    while ((m = VERSIONED_IMPORT.exec(text))) {
      hits.push(`${relative(ROOT, file).replaceAll('\\', '/')}: ${m[0]}`);
    }
  }
}

if (hits.length) {
  console.error(
    `[check-no-versioned-imports] ${hits.length} Figma-style package@version import(s) — tsc cannot resolve these:\n` +
      hits.slice(0, 40).join('\n') +
      (hits.length > 40 ? `\n… +${hits.length - 40} more` : ''),
  );
  process.exit(1);
}

console.log('[check-no-versioned-imports] ok');
