/**
 * Build edge registry.ts from registry.mirror.json (dumped from @roam/rush-settings).
 * Usage: node scripts/generate-rush-settings-registry.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mirrorPath = path.join(
  ROOT,
  'supabase/functions/_shared/rushSettings/registry.mirror.json',
);
const outPath = path.join(ROOT, 'supabase/functions/_shared/rushSettings/registry.ts');

const rows = JSON.parse(fs.readFileSync(mirrorPath, 'utf8'));
const entries = rows
  .map((r) => {
    const meta = {
      default: r.default,
      kind: r.kind,
      clientVisible: r.clientVisible,
      onReadError: r.onReadError,
      scopes: r.scopes,
      risk: r.risk,
      app: r.app,
      section: r.section,
      editRoles: Array.isArray(r.editRoles) ? r.editRoles : [],
    };
    if (r.envOverride) meta.envOverride = r.envOverride;
    if (r.enumValues) meta.enumValues = r.enumValues;
    if (r.min != null) meta.min = r.min;
    if (r.max != null) meta.max = r.max;
    if (r.hidden === true) meta.hidden = true;
    return `  ${JSON.stringify(r.key)}: ${JSON.stringify(meta)},`;
  })
  .join('\n');

const src = `/**
 * Edge mirror of @roam/rush-settings catalog (no Zod).
 * Keep in sync with packages/rush-settings — regenerate:
 *   npx tsx scripts/_dump-rush-settings-mirror.mjs
 *   node scripts/generate-rush-settings-registry.mjs
 */

export type SettingValueKind =
  | "boolean"
  | "number"
  | "string"
  | "string[]"
  | "number[]"
  | "object"
  | "enum";

export type SettingScope = "platform" | "market";
export type SettingRisk = "normal" | "high" | "locked";
export type OnReadError = "default" | "safe";
export type SettingApp = "platform" | "customer" | "courier" | "partner";

export type EdgeSettingDef = {
  default: unknown;
  kind: SettingValueKind;
  clientVisible: boolean;
  envOverride?: string;
  onReadError: OnReadError;
  scopes: SettingScope[];
  risk: SettingRisk;
  app: SettingApp;
  section: string;
  editRoles: string[];
  enumValues?: readonly string[];
  min?: number;
  max?: number;
  hidden?: boolean;
};

export const REGISTRY: Record<string, EdgeSettingDef> = {
${entries}
};

export const REGISTRY_KEYS = Object.keys(REGISTRY);

export function getRegistryEntry(key: string): EdgeSettingDef | undefined {
  return REGISTRY[key];
}

export function clientVisibleEntries(): Array<{ key: string; def: EdgeSettingDef }> {
  return REGISTRY_KEYS
    .filter((k) => REGISTRY[k].clientVisible)
    .map((key) => ({ key, def: REGISTRY[key] }));
}
`;

fs.writeFileSync(outPath, src, 'utf8');
console.log(`Wrote ${rows.length} entries → ${path.relative(ROOT, outPath)}`);
