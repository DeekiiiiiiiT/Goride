/**
 * Admin typecheck may only get cleaner.
 * Run: node scripts/admin-typecheck-baseline.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baselinePath = 'apps/admin/typecheck-baseline.txt';
const baseline = Number(fs.readFileSync(baselinePath, 'utf8').trim());
const result = spawnSync(
  'pnpm',
  ['--filter', '@roam/admin', 'exec', 'tsc', '--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'],
  { encoding: 'utf8', shell: true },
);
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const count = (output.match(/error TS/g) ?? []).length;
console.log(`admin typecheck errors: ${count} (baseline ${baseline})`);
if (count > baseline) {
  console.error(output);
  process.exit(1);
}
