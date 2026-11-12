#!/usr/bin/env node
/**
 * Week Reconciliation (WRA-27, audit Rev 24): fleet-toll, fleet-fuel, fleet-pay and fleet-claims run
 * from GENERATED bundles (supabase/functions/<slug>/index.ts). The week-version check
 * was added to their src/main.ts but the toll and pay bundles were never rebuilt, so
 * the live servers would have ignored it. This fails when a bundle lacks the check.
 * Fix: node scripts/build-edge-bundle.mjs <slug>
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const missing = [];
for (const slug of ['fleet-toll', 'fleet-fuel', 'fleet-pay', 'fleet-claims']) {
  const main = readFileSync(join(root, 'supabase', 'functions', slug, 'src', 'main.ts'), 'utf8');
  if (!main.includes('reconWeekVersionGuard')) continue;
  const bundlePath = join(root, 'supabase', 'functions', slug, 'index.ts');
  // Some bundles are not kept in git (e.g. fleet-fuel, .gitignore): the deploy builds them from
  // src/main.ts, so they always carry the check. Only kept bundles can go stale.
  if (!existsSync(bundlePath)) continue;
  const bundle = readFileSync(bundlePath, 'utf8');
  if (!bundle.includes('x-recon-week')) missing.push(slug);
}
if (missing.length) {
  console.error(`Week-version check missing from the built bundle of: ${missing.join(', ')}.`);
  console.error(`Rebuild: ${missing.map((s) => `node scripts/build-edge-bundle.mjs ${s}`).join(' && ')}`);
  process.exit(1);
}
console.log('week-version check is in every lane bundle');
