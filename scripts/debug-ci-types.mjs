/**
 * Debug CI typecheck: log @types/react resolution + tsc errors.
 * Temporary — remove after CI typecheck is proven green.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SESSION = 'e3b27f';
const ENDPOINT = 'http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function dbg(hypothesisId, location, message, data) {
  const body = {
    sessionId: SESSION,
    runId: process.env.DEBUG_RUN_ID || 'post-fix',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION },
      body: JSON.stringify(body),
    });
  } catch {
    /* ingest optional */
  }
  console.log(`[debug ${hypothesisId}] ${message}`, JSON.stringify(data));
}

function hasTypesReact(fromDir) {
  try {
    const req = createRequire(join(fromDir, 'package.json'));
    const resolved = req.resolve('@types/react/index.d.ts');
    return { ok: true, resolved };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function pkgHasDep(pkgPath, name) {
  if (!existsSync(pkgPath)) return { exists: false };
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return {
    exists: true,
    name: pkg.name,
    dep: pkg.dependencies?.[name] ?? null,
    devDep: pkg.devDependencies?.[name] ?? null,
    peer: pkg.peerDependencies?.[name] ?? null,
  };
}

const targets = [
  ['root', ROOT],
  ['fleet', join(ROOT, 'apps/fleet')],
  ['admin', join(ROOT, 'apps/admin')],
  ['roam-shared', join(ROOT, 'packages/roam-shared')],
  ['ui', join(ROOT, 'packages/ui')],
];

for (const [id, dir] of targets) {
  const types = hasTypesReact(dir);
  const declared = pkgHasDep(join(dir, 'package.json'), '@types/react');
  const reactDeclared = pkgHasDep(join(dir, 'package.json'), 'react');
  await dbg('A', `scripts/debug-ci-types.mjs:${id}`, '@types/react resolution', {
    id,
    dir,
    typesOk: types.ok,
    typesResolved: types.resolved || null,
    typesError: types.error || null,
    typesDeclared: declared,
    reactDeclared,
    nodeModulesTypes: existsSync(join(dir, 'node_modules/@types/react/index.d.ts')),
    rootHoistTypes: existsSync(join(ROOT, 'node_modules/@types/react/index.d.ts')),
  });
}

const tsc = spawnSync(
  'pnpm',
  ['--filter', '@roam/fleet', 'typecheck'],
  { cwd: ROOT, encoding: 'utf8', shell: true, env: process.env },
);
const combined = `${tsc.stdout || ''}\n${tsc.stderr || ''}`;
const errorLines = combined.split('\n').filter((l) => /error TS/.test(l)).slice(0, 30);
await dbg('B', 'scripts/debug-ci-types.mjs:fleet-typecheck', 'fleet tsc result', {
  status: tsc.status,
  errorCount: errorLines.length,
  errorLines,
  missingReactDecl: errorLines.filter((l) => /declaration file for module 'react'/.test(l)).length,
  implicitAny: errorLines.filter((l) => /implicitly has an 'any' type/.test(l)).length,
  errorBoundary: errorLines.filter((l) => /ErrorBoundary/.test(l)).length,
});

const cmdTsc = spawnSync(
  'pnpm',
  ['--filter', '@roam/rush-command', 'typecheck'],
  { cwd: ROOT, encoding: 'utf8', shell: true, env: process.env },
);
const cmdOut = `${cmdTsc.stdout || ''}\n${cmdTsc.stderr || ''}`;
const cmdErrors = cmdOut.split('\n').filter((l) => /error TS/.test(l)).slice(0, 20);
await dbg('C', 'scripts/debug-ci-types.mjs:command-typecheck', 'rush-command tsc result', {
  status: cmdTsc.status,
  errorCount: cmdErrors.length,
  errorLines: cmdErrors,
});

process.exit(tsc.status === 0 && cmdTsc.status === 0 ? 0 : 1);
