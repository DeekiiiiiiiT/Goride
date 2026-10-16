/**
 * Rush Settings production cutover helper.
 * Usage:
 *   node scripts/rush-settings-cutover.mjs check
 *   node scripts/rush-settings-cutover.mjs backfill-dry
 *   node scripts/rush-settings-cutover.mjs print-steps
 *
 * Does not deploy by itself — run the printed commands after check passes.
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cmd = process.argv[2] || 'print-steps';

function mustExist(rel) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) throw new Error(`missing: ${rel}`);
  console.log(`ok  ${rel}`);
}

function check() {
  console.log('=== Local readiness ===');
  mustExist('supabase/functions/_shared/rushSettings/registry.ts');
  mustExist('supabase/functions/delivery/appConfigRoutes.ts');
  mustExist('supabase/functions/delivery/admin/settingsRoutes.ts');
  mustExist('packages/dash-admin/src/pages/settings/SettingsSectionPage.tsx');
  mustExist('scripts/backfill-rush-settings.mjs');
  mustExist('scripts/rush-settings-stage-paths.txt');
  mustExist('docs/rush-settings-env-retirement.md');

  const deno = spawnSync(
    'deno',
    [
      'test',
      '--allow-read',
      '--allow-env',
      'supabase/functions/_shared/rushSettings/getSetting.test.ts',
      'supabase/functions/_shared/rushSettings/registry.drift.test.ts',
      'supabase/functions/_shared/rushSettings/enterpriseReaders.test.ts',
      'supabase/functions/delivery/maintenanceMiddleware.test.ts',
    ],
    { cwd: ROOT, encoding: 'utf8', shell: true },
  );
  if (deno.status !== 0) {
    console.error(deno.stdout || deno.stderr);
    throw new Error('Deno tests failed');
  }
  console.log('ok  deno rush-settings suite');
  console.log('\nReady for cutover. Next: node scripts/rush-settings-cutover.mjs print-steps');
}

function backfillDry() {
  const r = spawnSync(
    'node',
    ['scripts/backfill-rush-settings.mjs', '--dry'],
    { cwd: ROOT, encoding: 'utf8', shell: true, env: process.env },
  );
  console.log(r.stdout || '');
  if (r.stderr) console.error(r.stderr);
  process.exit(r.status ?? 1);
}

function printSteps() {
  console.log(`
=== Rush Settings cutover (run in order) ===

0) Commit ONLY paths listed in scripts/rush-settings-stage-paths.txt
   (exclude fleet/driver/parts/Dominion)

1) Env backfill (production secrets in env):
   node scripts/backfill-rush-settings.mjs --dry
   node scripts/backfill-rush-settings.mjs

2) Deploy edge:
   pnpm deploy:delivery
   pnpm deploy:payments
   # If _shared/rushSettings changed, prefer GitHub Actions deploy_all
   # or path-based deploy so every function gets the new shared code.

3) Deploy frontends (Vercel path deploy after merge to main, or hooks):
   dash-customer first  → https://roamrush.app/admin
   then dash-courier, dash-merchant, rush-command

4) Smoke (docs/rush-settings-architecture.md §2):
   - maintenance one app only
   - high-risk needs two people
   - visible settings change behaviour
   - /app-config has no betaUserIds
   - cash off stops COD without env
   - hours/holiday refuse with message
   - customer can request account deletion

5) Retire env overrides per docs/rush-settings-env-retirement.md

Do NOT use the old Settings UI until step 3 (dash-customer) is live.
`);
}

try {
  if (cmd === 'check') check();
  else if (cmd === 'backfill-dry') backfillDry();
  else printSteps();
} catch (err) {
  console.error(String(err?.message || err));
  process.exit(1);
}
