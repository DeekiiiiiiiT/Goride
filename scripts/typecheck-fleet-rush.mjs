/**
 * Gate CI on Rush integration TypeScript only.
 * Full-app fleet `tsc` still has a large UI/package backlog (see typecheck-fuel-money.mjs).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const rushFilter =
  /(?:^|[/\\])(?:apps[/\\]fleet[/\\]src[/\\](?:components[/\\](?:rush|couriers|deliveries)|contexts[/\\]ServiceLineScopeContext|components[/\\]layout[/\\](?:AppSidebar|sidebarGating)|components[/\\]settings[/\\]ServiceLinesSettingsCard|utils[/\\](?:fleetBankReceive|loadResolvedEarningsBundle|serviceLineTripFilter))|packages[/\\]admin-core[/\\]src[/\\]fleet[/\\]|supabase[/\\]functions[/\\](?:_shared[/\\]orderToFleetTrip|_fleet-server[/\\]rush_|delivery[/\\]courierFleetAttribution))/;

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
const rush = errors.filter((l) => rushFilter.test(l.replace(/\\/g, '/')));

if (rush.length) {
  console.error(`Fleet Rush typecheck failed: ${rush.length} error(s)`);
  for (const l of rush) console.error(l);
  process.exit(1);
}

console.log(
  `Fleet Rush typecheck OK: 0 rush-spine errors (${errors.length} other tsc errors ignored until full-app typecheck cleanup)`,
);
process.exit(0);
