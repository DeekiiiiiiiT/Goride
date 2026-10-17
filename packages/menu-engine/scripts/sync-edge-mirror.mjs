/**
 * Copy canonical engine modules into supabase/functions/_shared/menuEngine
 * and write exports.mirror.json for the drift test.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const srcDir = join(pkgRoot, 'src');
const edgeDir = join(pkgRoot, '../../supabase/functions/_shared/menuEngine');

mkdirSync(edgeDir, { recursive: true });

const files = [
  'types.ts',
  'conditions.ts',
  'ticket.ts',
  'priceLine.ts',
  'presets.ts',
  'convertLegacy.ts',
  'kits.ts',
  'snapshot.ts',
  'locationOverrides.ts',
  'index.ts',
];

for (const file of files) {
  copyFileSync(join(srcDir, file), join(edgeDir, file));
}

const indexSrc = readFileSync(join(srcDir, 'index.ts'), 'utf8');
const match = indexSrc.match(/export const ENGINE_EXPORTS = \[([\s\S]*?)\] as const/);
if (!match) throw new Error('ENGINE_EXPORTS not found in index.ts');
const names = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

const apiVersionMatch = readFileSync(join(srcDir, 'types.ts'), 'utf8').match(
  /ENGINE_API_VERSION = (\d+)/,
);
const apiVersion = Number(apiVersionMatch?.[1] || 0);

writeFileSync(
  join(edgeDir, 'exports.mirror.json'),
  `${JSON.stringify({ apiVersion, exports: names }, null, 2)}\n`,
);

console.log(`Mirrored ${files.length} files → ${edgeDir}`);
