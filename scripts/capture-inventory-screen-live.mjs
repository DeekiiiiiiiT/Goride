/**
 * Capture screen-live.png beside each Stitch screen.png (R13-02).
 * Uses Playwright against local Fleet with VITE_FLEET_INVENTORY_PHASE2=1.
 *
 *   $env:VITE_FLEET_INVENTORY_PHASE2='1'; npm run dev -- --port 5199   # apps/fleet
 *   node scripts/capture-inventory-screen-live.mjs --base http://127.0.0.1:5199
 *
 * Requires a signed-in session in the browser profile or pass --storage state.json from Playwright auth.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const repo = join(import.meta.dirname, '..');
const fleetStitch = join(repo, 'docs', 'stitch', 'roam-fleet-app');
const driverStitch = join(repo, 'docs', 'stitch', 'roam-driver-app');

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const base =
  baseIdx >= 0 && args[baseIdx + 1]
    ? args[baseIdx + 1].replace(/\/$/, '')
    : 'http://127.0.0.1:5199';
const storageIdx = args.indexOf('--storage');
const storageState =
  storageIdx >= 0 && args[storageIdx + 1] ? args[storageIdx + 1] : undefined;

function fleetRows() {
  const readme = readFileSync(join(fleetStitch, 'README.md'), 'utf8');
  const rows = [];
  for (const line of readme.split('\n')) {
    if (!/^\| IN\d/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
    const id = cells[1];
    const folder = cells[3];
    if (!id || !folder || folder === '—') continue;
    rows.push({ id, folder, viewport: id === 'IN18' ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  }
  return rows;
}

function driverRows() {
  const readme = readFileSync(join(driverStitch, 'README.md'), 'utf8');
  const rows = [];
  for (const line of readme.split('\n')) {
    if (!/^\| DK\d/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
    const id = cells[1];
    const folder = cells[3];
    if (!id || !folder || folder === '—') continue;
    rows.push({ id, folder, viewport: { width: 390, height: 844 } });
  }
  return rows;
}

const TAB_BY_IN = {
  IN1: 'overview',
  IN2: 'stock',
  IN3: 'stock',
  IN4: 'overview',
  IN5: 'overview',
  IN6: 'vehicle-kits',
  IN7: 'vehicle-kits',
  IN8: 'assets',
  IN9: 'assets',
  IN10: 'movements',
  IN11: 'purchasing',
  IN12: 'counts',
  IN13: 'alerts',
  IN14: 'overview',
  IN15: 'vehicle-kits',
  IN16: 'overview',
  IN17: 'overview',
  IN18: 'overview',
};

async function captureFleet(browser) {
  const context = await browser.newContext(
    storageState ? { storageState, viewport: { width: 1440, height: 900 } } : { viewport: { width: 1440, height: 900 } },
  );
  const page = await context.newPage();
  for (const row of fleetRows()) {
    const tab = TAB_BY_IN[row.id] ?? 'overview';
    const url = `${base}/vehicle-operations/inventory?tab=${tab}`;
    await page.setViewportSize(row.viewport);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
    const outDir = join(fleetStitch, 'inventory', row.folder);
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, 'screen-live.png');
    await page.screenshot({ path: outPath, fullPage: row.id === 'IN18' });
    console.log('captured', row.id, outPath);
  }
  await context.close();
}

async function captureDriver(browser) {
  const context = await browser.newContext(
    storageState ? { storageState, viewport: { width: 390, height: 844 } } : { viewport: { width: 390, height: 844 } },
  );
  const page = await context.newPage();
  for (const row of driverRows()) {
    await page.setViewportSize(row.viewport);
    await page.goto(`${base}/car-kit`, { waitUntil: 'networkidle', timeout: 120_000 });
    const outDir = join(driverStitch, 'car-kit', row.folder);
    if (!existsSync(outDir)) {
      console.warn('skip', row.id, 'missing folder', outDir);
      continue;
    }
    const outPath = join(outDir, 'screen-live.png');
    await page.screenshot({ path: outPath, fullPage: true });
    console.log('captured', row.id, outPath);
  }
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await captureFleet(browser);
  await captureDriver(browser);
} finally {
  await browser.close();
}
