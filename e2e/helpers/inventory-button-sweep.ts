import type { Locator, Page } from '@playwright/test';

const INVENTORY_API = /\/make-server-[^/]+\/inventory\//;
const DRIVER_API = /\/make-server-[^/]+\/inventory\/driver\//;

export const STITCH_DENY_SAMPLES = [
  'ACC-PHM-01',
  'ELC-DCM-01',
  'Deeki T',
  '98.4%',
  '64,820 km',
  'PO #JAM-7721',
];

export const INVENTORY_SEED_MARKERS = ['SEED Wiper 400mm', 'SEED-PO-1'];

export type SweepFailure = { screen: string; label: string; reason: string };

function trackInventoryResponses(page: Page) {
  const bad: { url: string; status: number }[] = [];
  const onResponse = (res: { url: () => string; status: () => number }) => {
    const u = res.url();
    if (!INVENTORY_API.test(u) && !DRIVER_API.test(u)) return;
    const status = res.status();
    if (status >= 400) bad.push({ url: u, status });
  };
  page.on('response', onResponse);
  return () => {
    page.off('response', onResponse);
    return bad;
  };
}

export async function assertNoStitchSamples(root: Locator): Promise<string | null> {
  const text = await root.innerText().catch(() => '');
  for (const needle of STITCH_DENY_SAMPLES) {
    if (text.includes(needle)) return `Stitch sample "${needle}" visible on screen`;
  }
  return null;
}

export async function assertSeedMarkers(root: Locator): Promise<string | null> {
  if (process.env.INVENTORY_SEED_ASSERT !== '1') return null;
  const text = await root.innerText().catch(() => '');
  const missing = INVENTORY_SEED_MARKERS.filter((m) => !text.includes(m));
  if (missing.length) return `missing seed markers: ${missing.join(', ')}`;
  return null;
}

/** Click each visible control; pass if network, modal/tab, or DOM changed. */
export async function sweepVisibleButtons(
  page: Page,
  screen: string,
  root: Locator,
): Promise<SweepFailure[]> {
  const failures: SweepFailure[] = [];
  const stopTracking = trackInventoryResponses(page);
  const controls = root.locator('button:visible, [role="tab"]:visible');
  const count = await controls.count();

  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    if (await control.isDisabled().catch(() => true)) continue;

    const label =
      (await control.getAttribute('aria-label')) ||
      (await control.innerText().catch(() => '')) ||
      `control-${i}`;
    const trimmed = label.replace(/\s+/g, ' ').trim().slice(0, 80) || `control-${i}`;

    let inventoryReq = false;
    let driverReq = false;
    const onReq = (req: { url: () => string }) => {
      const u = req.url();
      if (INVENTORY_API.test(u)) inventoryReq = true;
      if (DRIVER_API.test(u)) driverReq = true;
    };
    page.on('request', onReq);

    const urlBefore = page.url();
    const rootHtmlBefore = await root.innerHTML().catch(() => '');
    const dialogCountBefore = await page.locator('[role="dialog"]').count().catch(() => 0);

    await control.click({ timeout: 8_000 }).catch(() => {});

    await page.waitForTimeout(400);

    page.off('request', onReq);

    const urlAfter = page.url();
    const rootHtmlAfter = await root.innerHTML().catch(() => '');
    const dialogCountAfter = await page.locator('[role="dialog"]').count().catch(() => 0);

    const changed =
      inventoryReq ||
      driverReq ||
      urlAfter !== urlBefore ||
      rootHtmlAfter !== rootHtmlBefore ||
      dialogCountAfter !== dialogCountBefore;

    if (!changed) {
      failures.push({ screen, label: trimmed, reason: 'no network, navigation, modal, or DOM change' });
    }

    if (dialogCountAfter > dialogCountBefore) {
      const close = page
        .getByRole('button', { name: /close|cancel|not now|×/i })
        .first();
      if (await close.isVisible().catch(() => false)) {
        await close.click().catch(() => {});
        await page.waitForTimeout(200);
      }
    }
  }

  const badResponses = stopTracking();
  for (const r of badResponses) {
    failures.push({
      screen,
      label: 'inventory-api',
      reason: `HTTP ${r.status} ${r.url.slice(0, 120)}`,
    });
  }

  return failures;
}

/** Type distinct values into inputs; fail if another input mirrors the value. */
export async function assertFieldIsolation(page: Page, root: Locator): Promise<string | null> {
  const inputs = root.locator(
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([readonly]), textarea, select',
  );
  const n = await inputs.count();
  if (n < 2) return null;

  const values: string[] = [];
  for (let i = 0; i < Math.min(n, 6); i++) {
    const el = inputs.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    if (await el.isDisabled().catch(() => false)) continue;
    const tag = await el.evaluate((node) => node.tagName.toLowerCase());
    const distinct = `iso-${i}-${Date.now() % 10000}`;
    values.push(distinct);
    if (tag === 'select') {
      const opts = el.locator('option');
      const optCount = await opts.count();
      if (optCount > 1) await el.selectOption({ index: 1 }).catch(() => {});
    } else {
      await el.fill(distinct).catch(() => {});
    }
  }

  if (values.length < 2) return null;

  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const a = inputs.nth(i);
      const b = inputs.nth(j);
      const va = await a.inputValue().catch(() => '');
      const vb = await b.inputValue().catch(() => '');
      if (va && va === vb && va === values[i]) {
        return `inputs ${i} and ${j} share value "${va}"`;
      }
    }
  }
  return null;
}

export async function openFleetInventory(page: Page) {
  await page.goto('/vehicle-operations/inventory?tab=overview');
  await page
    .getByText(/Inventory & Asset Management/i)
    .first()
    .waitFor({ state: 'visible', timeout: 90_000 });
}

export const INVENTORY_TABS = [
  'overview',
  'stock',
  'vehicle-kits',
  'assets',
  'movements',
  'purchasing',
  'counts',
  'alerts',
] as const;
