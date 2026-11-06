import { execSync } from 'node:child_process';
import { test } from '@playwright/test';

test('inventory done-test postflight assert-clean', () => {
  execSync('node scripts/seed-inventory-done-tests.mjs assert-clean', {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
});
