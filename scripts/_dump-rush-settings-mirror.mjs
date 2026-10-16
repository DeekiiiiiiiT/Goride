/**
 * One-shot helper: dump @roam/rush-settings catalog fields for the edge mirror.
 * Run via: node --import tsx scripts/_dump-rush-settings-mirror.mjs
 * or: pnpm exec tsx scripts/_dump-rush-settings-mirror.mjs
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SETTINGS } from '../packages/rush-settings/src/catalog/index.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = ALL_SETTINGS.map((s) => ({
  key: s.key,
  default: s.default,
  kind: s.kind,
  clientVisible: s.clientVisible,
  envOverride: s.envOverride ?? null,
  onReadError: s.onReadError,
  scopes: s.scopes,
  risk: s.risk,
  app: s.app,
  section: s.section,
  enumValues: s.enumValues ?? null,
  editRoles: s.editRoles,
  min: s.min ?? null,
  max: s.max ?? null,
  hidden: s.hidden === true,
}));

const jsonPath = resolve(ROOT, 'supabase/functions/_shared/rushSettings/registry.mirror.json');
writeFileSync(jsonPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(`Wrote ${out.length} settings → ${jsonPath}`);

// Also refresh registry.ts from the mirror
await import('./generate-rush-settings-registry.mjs');
