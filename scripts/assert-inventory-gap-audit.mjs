#!/usr/bin/env node
/**
 * Fleet inventory gap audit gates (R20 §2, R22-03, R24-03).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gapDir = join(root, 'apps', 'fleet', 'src', 'components', 'inventory', 'gap');
const fleetDir = join(root, 'apps', 'fleet');
const driverCarKitDir = join(root, 'apps', 'driver', 'src', 'components', 'car-kit');

const forbiddenSamples = [
  '64,200',
  '4.9 / 5.0',
  '1,480',
  'Caribbean Tier',
  'Kingston Hub',
  'Hub Kingston',
  'Marlon',
  'Patterson',
  'Townsend',
  'Damion',
  'Guardian General',
  'PHM-PRO-V2',
  'DEV-70M',
];

function walkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...walkFiles(p));
    else if (/\.(tsx|ts|jsx|js)$/.test(name.name)) out.push(p);
  }
  return out;
}

function rel(file) {
  return file.replace(root + '\\', '').replace(root + '/', '');
}

let failed = false;

function fail(label, file, detail) {
  console.error(`FAIL ${label}: ${detail} in ${rel(file)}`);
  failed = true;
}

function stripOptions(text) {
  return text.replace(/<option\b[\s\S]*?<\/option>/gi, '');
}

function scanR22UiRules(file, text, label) {
  if (text.includes('style="')) {
    fail(label, file, 'string style= (use style={{ ... }})');
  }
  if (text.includes('checked=""')) {
    fail(label, file, 'checked="" (use checked={bool})');
  }
  for (const needle of forbiddenSamples) {
    if (text.includes(needle)) {
      fail(label, file, `forbidden sample "${needle}"`);
    }
  }

  const withoutOptions = stripOptions(text);
  const badInputValue = /<input\b(?![^>]*\btype=["'](?:radio|checkbox|hidden|submit|button|file))(?![^>]*\breadOnly)[^>]*\bvalue="[^"]+"/i;
  if (badInputValue.test(withoutOptions)) {
    fail(label, file, 'value=" literal on input (bind with value={})');
  }

  const controlRe = /<(input|select|textarea)\b[^>]*>/gi;
  let m;
  while ((m = controlRe.exec(text)) !== null) {
    const tag = m[0];
    const lower = tag.toLowerCase();
    if (lower.includes('type="button"') || lower.includes("type='button'")) continue;
    if (lower.includes('type="submit"') || lower.includes("type='submit'")) continue;
    if (lower.includes('type="hidden"') || lower.includes("type='hidden'")) continue;
    if (lower.includes('type="file"') || lower.includes("type='file'")) continue;
    if (lower.includes('type="radio"') || lower.includes("type='radio'")) continue;
    if (lower.includes('type="checkbox"') || lower.includes("type='checkbox'")) continue;
    if (/\bvalue=\{/.test(tag) || /\bchecked=\{/.test(tag) || /\bdefaultValue=\{/.test(tag)) continue;
    if (/\bdefaultChecked=\{/.test(tag)) continue;
    if (/<textarea[^>]*>\s*\{/.test(text.slice(m.index, m.index + 120))) continue;
    if (/^<select/i.test(tag) && /\bvalue=\{/.test(text.slice(m.index, m.index + 800))) continue;
    if (/readOnly|readonly/.test(tag)) continue;
    fail(label, file, `unbound control ${lower.slice(0, 40)}…`);
  }
}

const forbiddenPlates = ['5179KZ', '1505LM'];
const forbiddenRecordRe =
  /\b(?:AST|PO|RQ|CNT|OPN)-\d+\b/g;

function stripBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function scanR24Rules(file, text, label) {
  if (!/\.tsx$/i.test(file)) return;
  const stripped = stripBlockComments(text);

  const buttonRe = /<button\b[^>]*>/gi;
  let bm;
  while ((bm = buttonRe.exec(stripped)) !== null) {
    const tag = bm[0];
    const lower = tag.toLowerCase();
    if (/\bonclick\s*=/.test(lower)) continue;
    if (/\bdisabled\b/.test(lower)) continue;
    if (/\btype\s*=\s*["']submit["']/.test(lower)) continue;
    fail(label, file, `dead button (add onClick or disabled): ${tag.slice(0, 72)}…`);
  }

  if (/J\$\s*[\d,]+(?:\.\d+)?/.test(stripped)) {
    fail(label, file, 'literal J$ amount in JSX (use formatJmd from hook)');
  }

  if (forbiddenRecordRe.test(stripped)) {
    fail(label, file, 'literal record code (AST-/PO-/RQ-/CNT-/OPN-)');
  }
  forbiddenRecordRe.lastIndex = 0;

  for (const plate of forbiddenPlates) {
    if (stripped.includes(plate)) {
      fail(label, file, `forbidden plate "${plate}"`);
    }
  }
}

function scanDir(dir, label) {
  for (const file of walkFiles(dir)) {
    const text = readFileSync(file, 'utf8');
    if (text.includes('GapActionDock')) {
      fail(label, file, 'GapActionDock');
    }
    scanR22UiRules(file, text, label);
    scanR24Rules(file, text, label);
  }
}

scanDir(gapDir, 'gap');
scanDir(driverCarKitDir, 'driver car-kit');

for (const file of walkFiles(fleetDir)) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('GapActionDock')) {
    fail('fleet', file, 'GapActionDock');
  }
}

if (failed) process.exit(1);
console.log('OK — inventory gap audit checks passed.');
process.exit(0);
