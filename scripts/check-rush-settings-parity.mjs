#!/usr/bin/env node
/**
 * Compare @roam/rush-settings catalog keys + defaults with the edge REGISTRY mirror.
 * Fails on drift. Prefer regenerating via:
 *   npx tsx scripts/_dump-rush-settings-mirror.mjs
 *   node scripts/generate-rush-settings-registry.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mirrorPath = path.join(
  ROOT,
  'supabase/functions/_shared/rushSettings/registry.mirror.json',
);
const registryTsPath = path.join(
  ROOT,
  'supabase/functions/_shared/rushSettings/registry.ts',
);
const snapPath = path.join(
  ROOT,
  'packages/rush-settings/src/__snapshots__/registry.snapshot.test.ts.snap',
);

function fail(msg) {
  console.error(`check-rush-settings-parity: ${msg}`);
  process.exitCode = 1;
}

function parseRegistryKeys(ts) {
  return [...ts.matchAll(/^\s*"([^"]+)":\s*\{/gm)].map((m) => m[1]);
}

function parseSnapshotKeys(snap) {
  // Setting keys always contain a dot; nested template keys do not.
  return [
    ...new Set(
      [...snap.matchAll(/"key":\s*"([^"]+\.[^"]+)"/g)].map((m) => m[1]),
    ),
  ].sort();
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function loadPackageCatalog() {
  try {
    const mod = await import(
      pathToFileURL(
        path.join(ROOT, 'packages/rush-settings/src/catalog/index.ts'),
      ).href
    );
    return mod.ALL_SETTINGS.map((s) => ({
      key: s.key,
      default: s.default,
      clientVisible: s.clientVisible,
      risk: s.risk,
    }));
  } catch {
    return null;
  }
}

if (!fs.existsSync(mirrorPath) || !fs.existsSync(registryTsPath)) {
  fail('missing mirror JSON or registry.ts');
  process.exit(1);
}

const mirror = JSON.parse(fs.readFileSync(mirrorPath, 'utf8'));
const registryTs = fs.readFileSync(registryTsPath, 'utf8');
const edgeKeys = parseRegistryKeys(registryTs).sort();
const mirrorKeys = mirror.map((r) => r.key).sort();

let failed = false;

if (JSON.stringify(edgeKeys) !== JSON.stringify(mirrorKeys)) {
  fail('registry.ts keys ≠ registry.mirror.json keys');
  failed = true;
}

for (const row of mirror) {
  const keyIdx = registryTs.indexOf(JSON.stringify(row.key));
  if (keyIdx < 0) {
    fail(`key missing in registry.ts: ${row.key}`);
    failed = true;
    continue;
  }
  const slice = registryTs.slice(keyIdx, keyIdx + 8000);
  const defaultJson = JSON.stringify(row.default);
  if (!slice.includes(`"default":${defaultJson}`)) {
    fail(`default drift for ${row.key}`);
    failed = true;
  }
}

const pkgRows = await loadPackageCatalog();
if (pkgRows) {
  const pkgKeys = pkgRows.map((r) => r.key).sort();
  if (JSON.stringify(pkgKeys) !== JSON.stringify(mirrorKeys)) {
    fail('package catalog keys ≠ mirror keys');
    failed = true;
  }
  for (const row of pkgRows) {
    const m = mirror.find((x) => x.key === row.key);
    if (!m) continue;
    if (!deepEqual(m.default, row.default)) {
      fail(`default drift vs package for ${row.key}`);
      failed = true;
    }
    if (m.clientVisible !== row.clientVisible) {
      fail(`clientVisible drift vs package for ${row.key}`);
      failed = true;
    }
    if (m.risk !== row.risk) {
      fail(`risk drift vs package for ${row.key}`);
      failed = true;
    }
  }
} else if (fs.existsSync(snapPath)) {
  const snapKeys = parseSnapshotKeys(fs.readFileSync(snapPath, 'utf8'));
  if (JSON.stringify(snapKeys) !== JSON.stringify(mirrorKeys)) {
    fail('package snapshot keys ≠ mirror keys (install tsx for full default check)');
    failed = true;
  }
} else {
  fail('cannot load package catalog and snapshot missing');
  failed = true;
}

if (!failed && !process.exitCode) {
  console.log(
    `check-rush-settings-parity: ok (${mirrorKeys.length} keys, mirror ↔ edge ↔ package)`,
  );
} else {
  process.exit(1);
}
