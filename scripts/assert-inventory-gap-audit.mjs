#!/usr/bin/env node
/**
 * Fleet inventory gap audit gates (R20 §2, R22-03, R24-03).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gapDir = join(root, 'apps', 'fleet', 'src', 'components', 'inventory', 'gap');
const screensDir = join(root, 'apps', 'fleet', 'src', 'components', 'inventory', 'screens');
const inventoryPageFile = join(
  root,
  'apps',
  'fleet',
  'src',
  'components',
  'inventory',
  'InventoryPage.tsx',
);
const in2StockTableFile = join(
  root,
  'apps',
  'fleet',
  'src',
  'components',
  'inventory',
  'In2StockTable.tsx',
);
const fleetDir = join(root, 'apps', 'fleet');
const driverCarKitDir = join(root, 'apps', 'driver', 'src', 'components', 'car-kit');

const forbiddenDemoStrings = [
  'Demo button states',
  'Simulate "Sending" state',
  '(Preview)',
  'sendingStateDemoBox',
  'toggleStateBtn',
];

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

const emptyHandlerRe =
  /\bon(?:Click|Change)\s*=\s*\{\s*\(\s*\)\s*=>\s*(?:\{\s*\}|undefined|null)\s*\}/g;

function scanForbiddenDemo(file, text, label) {
  for (const needle of forbiddenDemoStrings) {
    if (text.includes(needle)) {
      fail(label, file, `forbidden demo string "${needle}"`);
    }
  }
}

function scanR26EmptyHandlers(file, text, label) {
  if (!/\.tsx$/i.test(file)) return;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/audit:\s*intentional-noop/i.test(line)) continue;
    emptyHandlerRe.lastIndex = 0;
    if (emptyHandlerRe.test(line)) {
      fail(label, file, `empty handler (R26-01): line ${i + 1}`);
    }
  }
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
    if (/In17States\.tsx$/i.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (text.includes('GapActionDock')) {
      fail(label, file, 'GapActionDock');
    }
    scanForbiddenDemo(file, text, label);
    scanR22UiRules(file, text, label);
    scanR24Rules(file, text, label);
    scanR26EmptyHandlers(file, text, label);
  }
}

function scanFile(file, label) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('GapActionDock')) {
    fail(label, file, 'GapActionDock');
  }
  scanForbiddenDemo(file, text, label);
  scanR22UiRules(file, text, label);
  scanR24Rules(file, text, label);
  scanR26EmptyHandlers(file, text, label);
}

scanDir(gapDir, 'gap');
scanDir(screensDir, 'inventory-screens');
scanFile(inventoryPageFile, 'inventory-page');
scanFile(in2StockTableFile, 'in2-stock-table');
scanDir(driverCarKitDir, 'driver car-kit');

const hooksDir = join(screensDir, 'hooks');

function scanR31ForbiddenTokens(file, text, label) {
  for (const token of ['stitchChrome', 'stitchInput', 'setStitchInput']) {
    if (text.includes(token)) {
      fail(label, file, `forbidden ${token} (R31-01)`);
    }
  }
  if (text.includes('formatJmd(null)')) {
    fail(label, file, 'formatJmd(null) — bind real amount (R31-03)');
  }
  if (/\bREF-0\b/.test(text)) {
    fail(label, file, 'REF-0 placeholder — use loaded reference (R31-03)');
  }
}

function scanR31HookEmptyBodies(file, text, label) {
  if (!/useIn\w+Form\.ts$/i.test(file)) return;
  const fnRe = /^\s*(export\s+)?(?:async\s+)?function\s+\w+|^\s*(const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/gm;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const arrowOnlyComment = /^\s*\w+\s*:\s*\([^)]*\)\s*=>\s*\{\s*\/\*[\s\S]*?\*\/\s*\},?\s*$/;
    if (arrowOnlyComment.test(line)) {
      fail(label, file, `hook handler is only a comment (R31-04): line ${i + 1}`);
    }
  }
}

function scanR31HookExportsUsed(file, text, label) {
  if (!/^useIn\w+Form\.ts$/i.test(file)) return;
  const screenName = file.replace(/^useIn(\d+.*)Form\.ts$/i, 'In$1.tsx').replace(/SetupForm/, 'FirstTimeSetup.tsx');
  const screenPath = join(screensDir, screenName);
  let screenText = '';
  try {
    screenText = readFileSync(screenPath, 'utf8');
  } catch {
    return;
  }
  const exportRe = /^\s{2}(set[A-Z]\w+|add[A-Z]\w+|open[A-Z]\w+|confirm\w+|issue\w*|receive\w*|export\w+|mark\w+|reset\w+|clear\w+|select\w+|save\w+|publish\w*|delete\w*|recount\w*|approve\w*|reject\w*|submit\w*|scan\w*|enter\w*|fulfill\w*|compare\w*|new\w*|load\w*|finish\w*|start\w*|poAction|recordMovement|registerAsset|moveAsset|sendRepair|markFaulty|retire|uploadDocument|saveSerial|setLogFilter|addIncidentNote|showArchived|setView|setMode|setTab|setPage|setSort|setLocationFilter|setStatusFilter|setTypeFilter|setSelectedMovementId|setReverseReason|setSettingsSection|setLocationName|setManualCode|setPoId|setVendorId|setLocationId|setReceivedOn|setFreightCost|setDutyCost|updateLine|removeLine|addLine|setItemId|setFromLocationId|setToLocationId|setVehicleId|setQty|setReason|setMemo|setSerial|setDocName|issueMissing|issueKits|openKitCard|exportMatrix|exportSpec|exportCsv|exportPurchasing|exportMovements|openMoreOptions|openSuppliers|openItem|openReceive|openIssue|openTransfer|openMovementsTab|openEditRule|openPo|openVendor|openSheet|reviewApproval|newRequisition|quickReceive|issueToCar|issueWholeKit|reportProblem|returnItem|issueItem|issueKit|runPreview|issue|receive|submitCustody|confirmReversal|poReceive|selectTemplate|saveDraft|dismissOfflineNotice|retryOfflineSend)\s*[,:]/gm;
  let m;
  while ((m = exportRe.exec(text)) !== null) {
    const name = m[1];
    if (name === 'formatJmd' || name === 'strField' || name === 'close' || name === 'shell' || name === 'live' || name === 'submit' || name === 'load' || name === 'finishSuccess') continue;
    if (!screenText.includes(name)) {
      fail(label, file, `exported "${name}" never referenced in ${screenName} (R31-04)`);
    }
  }
}

for (const file of walkFiles(screensDir)) {
  if (!/\.tsx$/i.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  scanR31ForbiddenTokens(file, text, 'inventory-screens');
}

for (const file of walkFiles(hooksDir)) {
  if (!/useIn\w+Form\.ts$/i.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  scanR31ForbiddenTokens(file, text, 'inventory-hooks');
  scanR31HookEmptyBodies(file, text, 'inventory-hooks');
  scanR31HookExportsUsed(file, text, 'inventory-hooks');
}

for (const file of walkFiles(fleetDir)) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('GapActionDock')) {
    fail('fleet', file, 'GapActionDock');
  }
}

if (failed) process.exit(1);
console.log('OK — inventory audit checks passed.');
process.exit(0);
