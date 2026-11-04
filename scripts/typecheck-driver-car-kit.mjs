/**
 * Gate CI on Driver car-kit TypeScript (Rev 32 Phase 0).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const carKitFilter =
  /(?:^|[/\\])(?:apps[/\\]driver[/\\])?src[/\\]components[/\\]car-kit(?:[/\\]|$)/;

const r = spawnSync(
  'pnpm',
  ['--filter', '@roam/driver', 'exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'],
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
const carKit = errors.filter((l) => carKitFilter.test(l.replace(/\\/g, '/')));

if (carKit.length) {
  console.error(`Driver car-kit typecheck failed: ${carKit.length} error(s)`);
  for (const l of carKit) console.error(l);
  process.exit(1);
}

console.log(
  `Driver car-kit typecheck OK: 0 car-kit errors (${errors.length} other tsc errors ignored until full-app typecheck cleanup)`,
);
process.exit(0);
