/**
 * Run all Roam Rush Courier API smoke scripts in sequence.
 * Usage: node scripts/smoke-courier-all.mjs
 *
 * Note: decline + delivery + issue each create real test orders.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const SCRIPTS = [
  'smoke-courier-auth.mjs',
  'smoke-courier-availability.mjs',
  'smoke-courier-settings.mjs',
  'smoke-courier-promotions.mjs',
  'smoke-courier-route.mjs',
  'smoke-courier-earnings.mjs',
  'smoke-courier-history.mjs',
  'smoke-courier-stack.mjs',
  'smoke-courier-offers.mjs',
  'smoke-courier-decline.mjs',
  'smoke-courier-delivery.mjs',
  'smoke-courier-issue.mjs',
];

console.log('=== Roam Rush Courier — full API smoke pack ===\n');

let failed = 0;
for (const script of SCRIPTS) {
  const scriptPath = path.join(root, 'scripts', script);
  console.log(`--- ${script} ---`);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    cwd: root,
  });
  if (result.status !== 0) failed += 1;
  console.log('');
}

if (failed) {
  console.error(`FAIL: ${failed} of ${SCRIPTS.length} courier smokes failed`);
  process.exit(1);
}

console.log(`PASS: All ${SCRIPTS.length} courier smoke scripts passed`);
