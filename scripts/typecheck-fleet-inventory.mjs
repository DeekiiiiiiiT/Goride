/**
 * Gate CI on Fleet inventory gap TypeScript (R22-01).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const inventoryFilter =
  /(?:^|[/\\])apps[/\\]fleet[/\\]src[/\\]components[/\\]inventory(?:[/\\]|$)/;

const r = spawnSync(
  'pnpm',
  ['--filter', '@roam/fleet', 'exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'],
  {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://ci-placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'ci-placeholder-anon-key',
    },
  },
);

const out = `${r.stdout || ''}\n${r.stderr || ''}`;
const errors = out.split(/\r?\n/).filter((l) => l.includes('error TS'));
const inventory = errors.filter((l) => inventoryFilter.test(l.replace(/\\/g, '/')));

if (inventory.length) {
  console.error(`Fleet inventory typecheck failed: ${inventory.length} error(s)`);
  for (const l of inventory) console.error(l);
  process.exit(1);
}

console.log(
  `Fleet inventory typecheck OK: 0 inventory errors (${errors.length} other tsc errors ignored until full-app typecheck cleanup)`,
);
process.exit(0);
