#!/usr/bin/env node
/**
 * Deno edge bundler cannot resolve bare @roam/* imports. Fleet files pulled into
 * supabase/functions (directly or via relative imports) must use relative paths
 * into packages/* instead.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const edgeDir = path.join(root, 'supabase/functions');
const fleetRoot = path.join(root, 'apps/fleet/src');

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(ent.name)) files.push(p);
  }
  return files;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const cand = base + ext;
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

const fleetImportRe = /['"](?:\.\.\/)+apps\/fleet\/src\/([^'"]+)['"]/g;
const entryPoints = new Set();

for (const f of walk(edgeDir)) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = fleetImportRe.exec(txt))) {
    const rel = m[1].replace(/\.tsx?$/, '');
    const base = path.normalize(path.join(fleetRoot, rel));
    for (const cand of [`${base}.ts`, `${base}.tsx`, base]) {
      if (fs.existsSync(cand)) entryPoints.add(cand);
    }
  }
}

const queue = [...entryPoints];
const seen = new Set();
const violations = [];

while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);

  const txt = fs.readFileSync(file, 'utf8');
  for (const line of txt.split(/\n/)) {
    const roam = line.match(
      /from ['"]@roam\/([^'"]+)['"]|export .+ from ['"]@roam\/([^'"]+)['"]/,
    );
    if (roam) {
      violations.push({
        file: path.relative(root, file),
        pkg: `@roam/${roam[1] || roam[2]}`,
        line: line.trim(),
      });
    }
  }

  const relRe = /from ['"](\.\.?\/[^'"]+)['"]/g;
  let m;
  while ((m = relRe.exec(txt))) {
    const resolved = resolveImport(file, m[1]);
    if (resolved?.includes('apps/fleet/src')) queue.push(resolved);
  }
}

if (violations.length) {
  console.error(
    `Fleet edge graph has ${violations.length} bare @roam/* import(s) (Deno deploy will fail):`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.pkg}`);
    console.error(`    ${v.line}`);
  }
  process.exit(1);
}

// A-9 / C-4: settlement money path must not import from apps/.
const settlementMoneyFiles = [
  path.join(edgeDir, '_fleet-server/driver_financial_periods.ts'),
  path.join(edgeDir, '_fleet-server/settlement_audit_repair.ts'),
  path.join(edgeDir, '_fleet-server/period_persist.ts'),
  path.join(edgeDir, '_fleet-server/period_projector.ts'),
  path.join(edgeDir, 'finance-recon/index.ts'),
];
const appsImportRe = /from ['"](?:\.\.\/)+apps\/[^'"]+['"]/g;
const appsViolations = [];
for (const f of settlementMoneyFiles) {
  if (!fs.existsSync(f)) continue;
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = appsImportRe.exec(txt))) {
    appsViolations.push({ file: path.relative(root, f), line: m[0] });
  }
}
if (appsViolations.length) {
  console.error(
    `Settlement money path has ${appsViolations.length} import(s) from apps/ (use packages/finance-core instead):`,
  );
  for (const v of appsViolations) {
    console.error(`  ${v.file}: ${v.line}`);
  }
  process.exit(1);
}

console.log(
  `Fleet edge import graph OK: ${seen.size} reachable fleet file(s), 0 bare @roam/* imports, settlement money path has 0 apps/ imports.`,
);
