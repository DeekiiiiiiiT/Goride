/**
 * Capture screen-live.png beside each Stitch screen.png (R15-01).
 *
 *   $env:VITE_FLEET_INVENTORY_PHASE2='1'; npm run dev -- --port 5199   # apps/fleet
 *   npm run dev -- --port 5174   # apps/driver
 *   npx playwright codegen http://127.0.0.1:5174 --save-storage=playwright/.auth/driver.json
 *
 *   node scripts/capture-inventory-screen-live.mjs \
 *     --driver-only \
 *     --driver-base http://127.0.0.1:5174 \
 *     --storage playwright/.auth/driver.json
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const repo = join(import.meta.dirname, '..');
const fleetStitch = join(repo, 'docs', 'stitch', 'roam-fleet-app');
const driverStitch = join(repo, 'docs', 'stitch', 'roam-driver-app');

const args = process.argv.slice(2);
const driverOnly = args.includes('--driver-only');
const fleetOnly = args.includes('--fleet-only');
const baseIdx = args.indexOf('--base');
const base =
  baseIdx >= 0 && args[baseIdx + 1]
    ? args[baseIdx + 1].replace(/\/$/, '')
    : 'http://127.0.0.1:5199';
const driverBaseIdx = args.indexOf('--driver-base');
const driverBase =
  driverBaseIdx >= 0 && args[driverBaseIdx + 1]
    ? args[driverBaseIdx + 1].replace(/\/$/, '')
    : 'http://127.0.0.1:5174';
const storageIdx = args.indexOf('--storage');
const storageState =
  storageIdx >= 0 && args[storageIdx + 1] ? args[storageIdx + 1] : undefined;
const allowUnsigned = args.includes('--allow-unsigned');

if (!storageState && !allowUnsigned) {
  console.error('FAIL: pass --storage <playwright-state.json> or --allow-unsigned for local-only capture');
  process.exit(1);
}
if (storageState && !existsSync(storageState)) {
  console.error(`FAIL: storage state not found: ${storageState}`);
  process.exit(1);
}

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

const MOCK_KIT_READY = {
  stub: false,
  organizationId: 'capture-org',
  vehicleId: 'veh-capture',
  vehicleLabel: '5179KZ',
  vehicleMakeModel: 'Toyota Roomy 2019',
  odometerKm: 64820,
  fuelLevelPct: 85,
  openReportCount: 2,
  lastCheckInAt: '2026-11-01T12:00:00.000Z',
  kitVersionLabel: 'v2.4-JA',
  lastSyncedAt: '2026-11-04T12:15:00.000Z',
  fleetSupportPhone: '8765550100',
  state: 'ready',
  items: [
    { id: '1', name: 'Spare tyre', status: 'present', locationHint: 'Trunk sub-floor' },
    { id: '2', name: 'Tyre pump', status: 'missing', locationHint: 'Trunk side-bin' },
    { id: '3', name: 'Toll tag', status: 'linked', locationHint: 'Managed by fleet' },
  ],
};

const MOCK_REPORTS = {
  items: [
    {
      id: 'rep-1',
      reportNo: 'RP-8842',
      issue: 'missing',
      note: 'Tyre pump',
      status: 'seen',
      itemLabel: 'Tyre pump',
      displayName: 'Tyre pump',
      createdAt: '2026-10-28T10:00:00.000Z',
      fleetReply: 'Replacement en route',
    },
  ],
  nextCursor: null,
  stub: false,
};

function assertLiveDiffersFromDesign(outDir, outPath, label) {
  const designPath = join(outDir, 'screen.png');
  if (!existsSync(designPath)) return;
  const a = readFileSync(designPath);
  const b = readFileSync(outPath);
  if (a.length === b.length && a.equals(b)) {
    console.error(`FAIL ${label}: screen-live.png is byte-identical to screen.png (R33-03)`);
    process.exit(1);
  }
}

async function mockCarKitRoute(page, payload) {
  await page.route('**/inventory/driver/car-kit**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

async function mockReportsRoute(page) {
  await page.route('**/inventory/driver/reports**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_REPORTS),
    });
  });
}

async function assertSignedIn(page, label) {
  const body = (await page.textContent('body')) ?? '';
  if (/welcome back/i.test(body)) {
    throw new Error(`${label}: page still shows sign-in (Welcome back)`);
  }
}

async function prepareDriverScreen(page, id) {
  await page.unroute('**/*').catch(() => {});

  const clickText = async (pattern) => {
    const btn = page.getByRole('button', { name: pattern }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(400);
      return true;
    }
    return false;
  };

  switch (id) {
    case 'DK1':
      await mockCarKitRoute(page, MOCK_KIT_READY);
      await page.goto(`${driverBase}/car-kit`, { waitUntil: 'networkidle', timeout: 120_000 });
      await assertSignedIn(page, id);
      break;
    case 'DK2':
      await mockCarKitRoute(page, MOCK_KIT_READY);
      await page.goto(`${driverBase}/car-kit`, { waitUntil: 'networkidle', timeout: 120_000 });
      await assertSignedIn(page, id);
      await clickText(/report a problem|report something/i);
      break;
    case 'DK3':
      await mockCarKitRoute(page, MOCK_KIT_READY);
      await page.goto(`${driverBase}/car-kit`, { waitUntil: 'networkidle', timeout: 120_000 });
      await assertSignedIn(page, id);
      await clickText(/report a problem|report something/i);
      await clickText(/send report/i);
      break;
    case 'DK4':
      await mockCarKitRoute(page, MOCK_KIT_READY);
      await mockReportsRoute(page);
      await page.goto(`${driverBase}/car-kit`, { waitUntil: 'networkidle', timeout: 120_000 });
      await assertSignedIn(page, id);
      await clickText(/^my reports/i);
      break;
    case 'DK5':
      await mockCarKitRoute(page, MOCK_KIT_READY);
      await page.goto(`${driverBase}/?capture=weekly-kit`, { waitUntil: 'networkidle', timeout: 120_000 });
      await assertSignedIn(page, id);
      await page.waitForSelector('.driver-car-kit-stitch', { timeout: 30_000 });
      break;
    case 'DK6':
      await mockCarKitRoute(page, { ...MOCK_KIT_READY, state: 'ready' });
      await page.goto(`${driverBase}/car-kit`, { waitUntil: 'networkidle', timeout: 120_000 });
      await assertSignedIn(page, id);
      break;
    case 'DK7':
      await mockCarKitRoute(page, MOCK_KIT_READY);
      await mockReportsRoute(page);
      await page.goto(`${driverBase}/car-kit`, { waitUntil: 'networkidle', timeout: 120_000 });
      await assertSignedIn(page, id);
      await clickText(/^my reports/i);
      await page.waitForTimeout(500);
      await clickText(/view update|update status|open report/i);
      break;
    default:
      await page.goto(`${driverBase}/car-kit`, { waitUntil: 'networkidle', timeout: 120_000 });
      await assertSignedIn(page, id);
      break;
  }
}

async function captureDk6StateViews(page, outDir) {
  const states = [
    {
      file: 'screen-live-loading.png',
      payload: null,
      delay: 0,
      hook: async () => {
        await page.route('**/inventory/driver/car-kit**', async (route) => {
          if (route.request().method() !== 'GET') {
            await route.continue();
            return;
          }
          await new Promise((r) => setTimeout(r, 120_000));
          await route.fulfill({ status: 200, body: JSON.stringify(MOCK_KIT_READY) });
        });
      },
    },
    {
      file: 'screen-live-nocar.png',
      payload: {
        stub: false,
        organizationId: 'capture-org',
        vehicleId: null,
        vehicleLabel: null,
        items: [],
        openReportCount: 0,
        lastCheckInAt: null,
        state: 'no_vehicle',
      },
    },
    {
      file: 'screen-live-nokit.png',
      payload: {
        stub: false,
        organizationId: 'capture-org',
        vehicleId: 'veh-capture',
        vehicleLabel: '1505LM',
        vehicleMakeModel: 'Honda Fit 2018',
        fuelLevelPct: 85,
        odometerKm: 45200,
        items: [],
        openReportCount: 0,
        lastCheckInAt: null,
        state: 'no_kit',
      },
    },
    {
      file: 'screen-live-loadfailed.png',
      payload: null,
      hook: async () => {
        await page.route('**/inventory/driver/car-kit**', async (route) => {
          if (route.request().method() !== 'GET') {
            await route.continue();
            return;
          }
          await route.fulfill({ status: 503, body: JSON.stringify({ error: 'offline' }) });
        });
      },
    },
  ];

  for (const st of states) {
    await page.unroute('**/*').catch(() => {});
    if (st.hook) await st.hook();
    else if (st.payload) await mockCarKitRoute(page, st.payload);
    await page.goto(`${driverBase}/car-kit`, { waitUntil: st.file.includes('loading') ? 'domcontentloaded' : 'networkidle', timeout: 120_000 });
    await page.waitForTimeout(st.file.includes('loading') ? 600 : 400);
    const outPath = join(outDir, st.file);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log('captured DK6', st.file, outPath);
  }
}

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
    await assertSignedIn(page, row.id);
    const outDir = join(fleetStitch, 'inventory', row.folder);
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, 'screen-live.png');
    await page.screenshot({ path: outPath, fullPage: row.id === 'IN18' });
    assertLiveDiffersFromDesign(outDir, outPath, row.id);
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
    await prepareDriverScreen(page, row.id);
    const outDir = join(driverStitch, 'car-kit', row.folder);
    if (!existsSync(outDir)) {
      console.warn('skip', row.id, 'missing folder', outDir);
      continue;
    }
    const outPath = join(outDir, 'screen-live.png');
    await page.screenshot({ path: outPath, fullPage: true });
    assertLiveDiffersFromDesign(outDir, outPath, row.id);
    console.log('captured', row.id, outPath);
    if (row.id === 'DK6') {
      await captureDk6StateViews(page, outDir);
    }
  }
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  if (!driverOnly) await captureFleet(browser);
  if (!fleetOnly) await captureDriver(browser);
} finally {
  await browser.close();
}
