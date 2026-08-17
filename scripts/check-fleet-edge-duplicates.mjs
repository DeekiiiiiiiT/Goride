#!/usr/bin/env node
/**
 * Catches duplicate named import/export identifiers in fleet edge files.
 * Those SyntaxErrors crash the whole worker (503 everywhere) and the UI
 * looks like data was wiped.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'supabase', 'functions', '_fleet-server');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function namesFromBraceList(inner) {
  return inner
    .split(',')
    .map((part) => {
      const cleaned = part.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/, '').trim();
      if (!cleaned) return '';
      const noType = cleaned.replace(/^type\s+/, '');
      const ident = noType.split(/\s+as\s+/)[0].trim();
      return ident;
    })
    .filter(Boolean);
}

function collect(text, kind) {
  const re =
    kind === 'import'
      ? /(?:^|\n)import\s+(?:type\s+)?\{([^}]+)\}\s+from/g
      : /(?:^|\n)export\s+(?:type\s+)?\{([^}]+)\}/g;
  const seen = new Map();
  const dups = [];
  for (const m of text.matchAll(re)) {
    for (const name of namesFromBraceList(m[1])) {
      if (seen.has(name)) dups.push(name);
      else seen.set(name, true);
    }
  }
  return dups;
}

const files = walk(ROOT);
let failed = false;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const importDups = collect(text, 'import');
  const exportDups = collect(text, 'export');
  if (importDups.length || exportDups.length) {
    failed = true;
    const rel = path.relative(process.cwd(), file);
    if (importDups.length) console.error(`${rel}: duplicate import ${[...new Set(importDups)].join(', ')}`);
    if (exportDups.length) console.error(`${rel}: duplicate export ${[...new Set(exportDups)].join(', ')}`);
  }
}

if (failed) {
  console.error('Fleet edge duplicate identifier(s) would crash worker boot (503 / empty UI).');
  process.exit(1);
}
console.log('Fleet edge named import/export identifiers are unique.');
