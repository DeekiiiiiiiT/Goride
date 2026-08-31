#!/usr/bin/env node
/**
 * Fails when fuel_controller loses org helpers / permission gates on money + audit routes.
 * Companion to scripts/check-toll-org-scope.mjs and FUEL_SYSTEM_AUDIT §K15.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTROLLER = path.join(
  ROOT,
  'supabase/functions/_fleet-server/fuel_controller.tsx',
);

let failed = false;

function fail(msg) {
  failed = true;
  console.error(msg);
}

if (!fs.existsSync(CONTROLLER)) {
  fail('missing fuel_controller.tsx');
} else {
  const src = fs.readFileSync(CONTROLLER, 'utf8');

  const checks = [
    [/from\s+["']\.\/org_scope\.ts["']/, 'must import org_scope helpers'],
    [/filterByOrg\s*\(/, 'read paths must call filterByOrg'],
    [/belongsToOrg\s*\(/, 'single-record paths must call belongsToOrg'],
    [/requirePlatformStaff\s*\(\s*\)/, 'admin ops must use requirePlatformStaff'],
    [
      /app\.patch\([^)]*\/transactions\/:id\/lock[^,]*,\s*requirePermission\(\s*["']transactions\.edit["']\s*\)/,
      'PATCH /transactions/:id/lock must require transactions.edit',
    ],
    [
      /app\.get\([^)]*\/admin\/spatial-review-queue[^,]*,\s*requirePlatformStaff\(\s*\)/,
      'GET /admin/spatial-review-queue must requirePlatformStaff',
    ],
    [
      /app\.get\([^)]*\/fuel-reconciliation\/periods-health[^,]*,\s*requirePermission\(\s*["']fuel\.view["']\s*\)/,
      'GET /fuel-reconciliation/periods-health must require fuel.view',
    ],
    [
      /app\.get\([^)]*\/fuel-audit\/deadhead\/fleet[^,]*,\s*requirePermission\(\s*["']fuel\.view["']\s*\)/,
      'GET /fuel-audit/deadhead/fleet must require fuel.view',
    ],
    [
      /app\.get\([^)]*\/fuel-pnl-offset-backfill\/status[^,]*,\s*requirePlatformStaff\(\s*\)/,
      'GET /fuel-pnl-offset-backfill/status must requirePlatformStaff',
    ],
    [
      /app\.post\([^)]*\/geo\/geocode[^,]*,\s*requirePermission\(\s*["']fuel\.edit_entry["']\s*\)/,
      'POST /geo/geocode must require fuel.edit_entry',
    ],
    [
      /app\.post\([^)]*\/geo\/reverse-geocode[^,]*,\s*requirePermission\(\s*["']fuel\.edit_entry["']\s*\)/,
      'POST /geo/reverse-geocode must require fuel.edit_entry',
    ],
    [/assertGeoRateLimit/, 'geocode routes must enforce assertGeoRateLimit'],
  ];

  for (const [re, msg] of checks) {
    if (!re.test(src)) fail(`fuel_controller.tsx: ${msg}`);
  }
}

if (failed) {
  console.error('fuel org-scope check failed');
  process.exit(1);
}
console.log('fuel org-scope OK');
