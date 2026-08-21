/**
 * Run all Roam Rush Partner API smoke scripts in sequence.
 * Usage: node scripts/smoke-merchant-all.mjs
 *
 * Note: pause + order-flow create side effects (toggle accepting orders / real test order).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getApiKeys } from './smoke/_shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const SCRIPTS = [
  'smoke-merchant-auth.mjs',
  'smoke-merchant-menu.mjs',
  'smoke-merchant-orders.mjs',
  'smoke-merchant-analytics.mjs',
  'smoke-merchant-earnings.mjs',
  'smoke-merchant-promotions.mjs',
  'smoke-merchant-settings.mjs',
  'smoke-merchant-hours.mjs',
  'smoke-merchant-team.mjs',
  'smoke-merchant-notifications.mjs',
  'smoke-merchant-connect.mjs',
  'smoke-merchant-pause.mjs',
  'smoke-merchant-order-flow.mjs',
];

console.log('=== Roam Rush Partner — full API smoke pack ===\n');

// One CLI key fetch for the whole pack (avoids Windows telemetry EPERM on every child).
const { anonKey, serviceKey } = getApiKeys();
const childEnv = {
  ...process.env,
  SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
};

let failed = 0;
for (const script of SCRIPTS) {
  const scriptPath = path.join(root, 'scripts', script);
  console.log(`--- ${script} ---`);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    cwd: root,
    env: childEnv,
  });
  if (result.status !== 0) failed += 1;
  console.log('');
}

if (failed) {
  console.error(`FAIL: ${failed} of ${SCRIPTS.length} partner smokes failed`);
  process.exit(1);
}

console.log(`PASS: All ${SCRIPTS.length} partner smoke scripts passed`);
