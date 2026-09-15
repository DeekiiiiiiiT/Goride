#!/usr/bin/env node
/**
 * Remittance separation (S-2, S-3, S-4, S-6):
 * - _fleet-server must not write courier_remittance_* (read views OK if any)
 * - delivery/remittance must not use Layer B Collect vocabulary
 * - fleet-financials must not use remittance write vocabulary
 * - S-6: a remittance changeset must not also touch fleet-financials/**
 *   (Log Cash UX is a separate workstream — never fold into remittance PRs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const errors = [];

// S-2: fleet-server must not mutate remittance tables
const fleetServer = path.join(ROOT, 'supabase', 'functions', '_fleet-server');
for (const abs of walk(fleetServer)) {
  const code = stripComments(fs.readFileSync(abs, 'utf8'));
  if (/courier_remittance_(accounts|events|settlements|exceptions)/.test(code)) {
    if (/\.(insert|update|upsert|delete)\s*\(/i.test(code) || /from\(['"]courier_remittance/.test(code)) {
      if (/apply_remittance_event|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(code)) {
        errors.push(
          `S-2: ${path.relative(ROOT, abs)} must not write courier_remittance_*`,
        );
      }
    }
  }
}

// S-3: remittance module must not use Settlement Week / Collect vocabulary as identifiers
const remittanceRoot = path.join(ROOT, 'supabase', 'functions', 'delivery', 'remittance');
const forbiddenRemit = [
  /\bperiod_anchor\b/,
  /\bsettlement_week\b/,
  /\bcash_returned\b/,
  /\bcash_still_held\b/,
  /\blogCash\b/,
  /\blog_cash\b/,
];
if (fs.existsSync(remittanceRoot)) {
  for (const abs of walk(remittanceRoot)) {
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    for (const re of forbiddenRemit) {
      if (re.test(code)) {
        errors.push(`S-3: ${path.relative(ROOT, abs)} uses forbidden Layer B identifier ${re}`);
      }
    }
  }
}

// S-4: fleet-financials must not call remittance write APIs
const financials = path.join(ROOT, 'apps', 'fleet', 'src', 'components', 'fleet-financials');
const forbidFinancials = [/\bapply_remittance_event\b/, /\bcourier_remittance_/, /\bremitRemittance\b/];
if (fs.existsSync(financials)) {
  for (const abs of walk(financials)) {
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    for (const re of forbidFinancials) {
      if (re.test(code)) {
        errors.push(`S-4: ${path.relative(ROOT, abs)} must not wire remittance writes (${re})`);
      }
    }
  }
}

// S-6: remittance workstream must stay out of Driver Settlements desk.
// (a) No service-picker LogCashWizard under fleet-financials (Part 6.3 / R-6).
// (b) remittance modules must not import fleet-financials.
// (c) Optional diff gate: set REMITTANCE_S6_DIFF=1 to fail when remittance paths and
//     fleet-financials change together (use on PRs after the harden restore lands).
const logCashWizard = path.join(
  ROOT,
  'apps',
  'fleet',
  'src',
  'components',
  'fleet-financials',
  'settlements',
  'LogCashWizard.tsx',
);
if (fs.existsSync(logCashWizard)) {
  errors.push(
    'S-6: LogCashWizard.tsx must not exist under fleet-financials (Delivery tile on Collect desk)',
  );
}

if (fs.existsSync(remittanceRoot)) {
  for (const abs of walk(remittanceRoot)) {
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    if (/fleet-financials|DriverSettlementsPage|LogCashWizard/.test(code)) {
      errors.push(
        `S-6: ${path.relative(ROOT, abs)} must not reference fleet-financials / Log Cash desk`,
      );
    }
  }
}

function changedFilesVsBase() {
  const base = process.env.REMITTANCE_S6_BASE || 'origin/main';
  try {
    const out = execSync(`git diff --name-only ${base}...HEAD`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const remittancePathRe =
  /(^|\/)(supabase\/functions\/delivery\/remittance\/|packages\/dash-admin\/src\/pages\/remittance\/|apps\/dash-courier\/src\/pages\/remittance\/|supabase\/migrations\/[^/]*remittance)/;
const fleetFinancialsRe = /^apps\/fleet\/src\/components\/fleet-financials\//;

if (process.env.REMITTANCE_S6_DIFF === '1') {
  const changed = changedFilesVsBase();
  const touchesRemittance = changed.some((f) => remittancePathRe.test(f.replace(/\\/g, '/')));
  const touchesFinancials = changed.some((f) => fleetFinancialsRe.test(f.replace(/\\/g, '/')));
  if (touchesRemittance && touchesFinancials) {
    errors.push(
      'S-6: remittance changeset must not also edit apps/fleet/src/components/fleet-financials/** (set REMITTANCE_S6_DIFF=1)',
    );
  }
}

if (errors.length) {
  console.error('Remittance separation check failed:\n');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log('OK: remittance separation (S-2/S-3/S-4/S-6)');
process.exit(0);
