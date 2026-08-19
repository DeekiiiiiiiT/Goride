/**
 * Run all Roam Rush customer API smoke scripts in sequence.
 * Usage: node scripts/smoke-customer-all.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const SCRIPTS = [
  'smoke-customer-auth.mjs',
  'smoke-customer-signup.mjs',
  'smoke-customer-discovery.mjs',
  'smoke-customer-favorites.mjs',
  'smoke-customer-checkout.mjs',
  'smoke-customer-orders.mjs',
  'smoke-customer-cancel.mjs',
  'smoke-customer-issue.mjs',
  'smoke-customer-review.mjs',
];

console.log('=== Roam Rush customer — full API smoke pack ===\n');

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
  console.error(`FAIL: ${failed} of ${SCRIPTS.length} customer smokes failed`);
  process.exit(1);
}

console.log(`PASS: All ${SCRIPTS.length} customer smoke scripts passed`);
