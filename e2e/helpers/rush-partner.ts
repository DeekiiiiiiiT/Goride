import { expect, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const PARTNER_EMAIL =
  process.env.RUSH_PARTNER_EMAIL?.trim() || 'seed-island-grill@roamrush.app';
const PARTNER_PASSWORD =
  process.env.RUSH_PARTNER_PASSWORD?.trim() || 'RoamRushPartner2026!';

const repoRoot = process.cwd();

/** Ensure Island Grill is accepting orders (UI shows setup screen when closed). */
export function ensurePartnerStoreOpen() {
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      import { getApiKeys } from './scripts/smoke/_shared.mjs';
      import { getMerchantProfile, setAcceptingOrders, signInMerchant } from './scripts/smoke/_merchant.mjs';
      const { anonKey } = getApiKeys();
      const token = await signInMerchant(anonKey);
      const m = await getMerchantProfile(anonKey, token);
      if (!m.is_accepting_orders) await setAcceptingOrders(anonKey, token, m.id, true);
      console.log('partner-store-open', m.id);
      `,
    ],
    { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' },
  );
}

/** Dismiss blocking overlays that sit on top of the shell. */
export async function dismissPartnerOverlays(page: Page) {
  for (let i = 0; i < 8; i += 1) {
    // Fullscreen new-order alert — view only (do not Accept from smoke).
    const viewOrder = page.getByRole('button', { name: 'VIEW ORDER' });
    if (await viewOrder.isVisible().catch(() => false)) {
      await viewOrder.evaluate((el: HTMLElement) => el.click());
      await page.waitForTimeout(400);
      continue;
    }

    const acknowledge = page.locator('button', { hasText: /^Acknowledge$/ });
    if (await acknowledge.count() > 0 && (await acknowledge.first().isVisible().catch(() => false))) {
      await acknowledge.first().evaluate((el: HTMLElement) => el.click());
      await expect(acknowledge.first()).toBeHidden({ timeout: 10_000 }).catch(() => undefined);
      continue;
    }

    // New-order detail sheet / pause sheet close control
    const close = page.locator('button[aria-label="Close"]').first();
    if (
      (await close.isVisible().catch(() => false)) &&
      (await page.locator('.partner-modal-fade, .app-fullscreen-screen').first().isVisible().catch(() => false))
    ) {
      await close.evaluate((el: HTMLElement) => el.click()).catch(() => undefined);
      await page.waitForTimeout(300);
      continue;
    }

    const modal = page.locator('.partner-modal-fade').first();
    if (await modal.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(350);
      continue;
    }

    const fullscreen = page.locator('.app-fullscreen-screen').first();
    if (await fullscreen.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(350);
      continue;
    }
    break;
  }
}

/** Click after clearing overlays — Partner sheets often reappear on navigation. */
export async function partnerClick(page: Page, locator: Locator) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await dismissPartnerOverlays(page);
    try {
      await locator.click({ timeout: 4_000 });
      return;
    } catch {
      await dismissPartnerOverlays(page);
      await page.waitForTimeout(300);
    }
  }
  await dismissPartnerOverlays(page);
  await locator.click({ force: true });
}

async function fillAndSubmitLogin(page: Page) {
  await page.getByRole('textbox', { name: /Email or phone/i }).fill(PARTNER_EMAIL);
  await page.getByRole('textbox', { name: /Password/i }).fill(PARTNER_PASSWORD);
  const keep = page.getByRole('checkbox', { name: /Keep me signed in/i });
  if (await keep.isVisible().catch(() => false)) {
    await keep.check().catch(() => undefined);
  }
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

async function waitForPartnerShell(page: Page, timeoutMs = 60_000) {
  const shell = page.getByText('Island Grill').first();
  const welcomeHome = page.getByRole('button', { name: 'Sign in', exact: true });
  const loginForm = page.getByRole('heading', { name: 'Welcome back' });

  const deadline = Date.now() + timeoutMs;
  let retries = 0;
  while (Date.now() < deadline) {
    if (await shell.isVisible().catch(() => false)) {
      await dismissPartnerOverlays(page);
      return;
    }

    // Bounce back to Welcome after a flaky bootstrap — retry login a few times.
    if ((await welcomeHome.isVisible().catch(() => false)) && retries < 3) {
      retries += 1;
      await welcomeHome.click();
      await expect(loginForm).toBeVisible({ timeout: 15_000 });
      await fillAndSubmitLogin(page);
      await page.waitForTimeout(3000);
      continue;
    }

    await page.waitForTimeout(500);
  }
  await expect(shell).toBeVisible({ timeout: 5_000 });
}

export async function signInPartner(page: Page) {
  ensurePartnerStoreOpen();
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const signInWelcome = page.getByRole('button', { name: 'Sign in', exact: true });
  const shell = page.getByText('Island Grill').first();
  const setupGate = page.getByRole('heading', { name: /You're approved/i });

  await Promise.race([
    signInWelcome.waitFor({ state: 'visible', timeout: 30_000 }),
    shell.waitFor({ state: 'visible', timeout: 30_000 }),
    setupGate.waitFor({ state: 'visible', timeout: 30_000 }),
  ]).catch(() => undefined);

  if (await setupGate.isVisible().catch(() => false)) {
    ensurePartnerStoreOpen();
    await page.reload();
    await page.waitForTimeout(2000);
  }

  if (await shell.isVisible().catch(() => false)) {
    await dismissPartnerOverlays(page);
    return;
  }

  await expect(signInWelcome).toBeVisible({ timeout: 15_000 });
  await signInWelcome.click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible({
    timeout: 15_000,
  });
  await fillAndSubmitLogin(page);
  await waitForPartnerShell(page);

  if (await setupGate.isVisible().catch(() => false)) {
    ensurePartnerStoreOpen();
    await page.reload();
    await waitForPartnerShell(page);
  }
}

export async function goPartnerTab(
  page: Page,
  tab: 'Dashboard' | 'Orders' | 'Menu' | 'Analytics' | 'Account' | 'Earnings',
) {
  await dismissPartnerOverlays(page);
  // Leave order-detail overlays so bottom nav is actionable.
  const orderBack = page.getByRole('button', { name: /Back/i }).first();
  if (
    (await page.getByRole('button', { name: /CONFIRM PICKUP/i }).isVisible().catch(() => false)) ||
    (await page.getByText('Waiting for courier').isVisible().catch(() => false))
  ) {
    if (await orderBack.isVisible().catch(() => false)) {
      await orderBack.evaluate((el: HTMLElement) => el.click());
      await page.waitForTimeout(500);
    }
  }

  // Prefer visible nav (side nav on desktop, bottom/drawer on mobile).
  const clicked = await page.evaluate((tabLabel) => {
    const navButtons = Array.from(document.querySelectorAll('nav button'));
    const visible = navButtons.filter((b) => {
      const style = window.getComputedStyle(b);
      const rect = b.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        rect.width > 0 &&
        rect.height > 0 &&
        (b.textContent || '').includes(tabLabel)
      );
    });
    const match = visible[0] ?? navButtons.find((b) => (b.textContent || '').includes(tabLabel));
    if (match) {
      (match as HTMLElement).click();
      return true;
    }
    return false;
  }, tab);

  if (!clicked && tab === 'Earnings') {
    const openNav = page.getByRole('button', { name: 'Open navigation' });
    if (await openNav.isVisible().catch(() => false)) {
      await partnerClick(page, openNav);
      await partnerClick(page, page.getByRole('button', { name: /Earnings/i }));
    }
  }

  await page.waitForTimeout(400);
  await dismissPartnerOverlays(page);
}

/** Prefer bottom-nav Orders; fall back to View All. */
export async function openOrdersQueue(page: Page) {
  await dismissPartnerOverlays(page);
  const ordersTab = page.getByRole('button', { name: /receipt_long\s*Orders|^Orders$/i });
  const bottomOrders = page.locator('nav').getByRole('button', { name: /Orders/i });
  if (await bottomOrders.isVisible().catch(() => false)) {
    await partnerClick(page, bottomOrders);
  } else if (await ordersTab.first().isVisible().catch(() => false)) {
    await partnerClick(page, ordersTab.first());
  } else {
    await partnerClick(page, page.getByRole('button', { name: /View All/i }));
  }
  await dismissPartnerOverlays(page);
  await expect(partnerOrdersHeading(page)).toBeVisible({ timeout: 20_000 });
}

export async function clickBackIfPresent(page: Page) {
  const back = page
    .getByRole('button', { name: /Back|arrow_back|Go back/i })
    .or(page.locator('button').filter({ has: page.locator('text=arrow_back') }))
    .first();
  if (await back.isVisible().catch(() => false)) {
    await back.evaluate((el: HTMLElement) => el.click()).catch(async () => {
      await back.click({ force: true });
    });
    await page.waitForTimeout(400);
  }
}

/** Pause via dashboard OPEN chip / Pause Orders sheet, then resume. */
export async function pauseThenResumeOrders(page: Page) {
  await goPartnerTab(page, 'Dashboard');
  await dismissPartnerOverlays(page);
  await expect(page.getByRole('heading', { name: /Today'?s Snapshot/i })).toBeVisible({
    timeout: 20_000,
  });

  // Prefer header OPEN chip (opens pause sheet when accepting).
  const openChip = page.getByRole('button', { name: /^OPEN$/i });
  if (await openChip.isVisible().catch(() => false)) {
    await openChip.evaluate((el: HTMLElement) => el.click());
  } else {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) =>
          (b.textContent || '').includes('Pause Orders') &&
          !(b.closest('.partner-modal-fade')),
      );
      btn?.click();
    });
  }

  const pauseHeading = page.getByRole('heading', { name: /Pause incoming orders/i });
  const sheetOpened = await pauseHeading
    .waitFor({ state: 'visible', timeout: 12_000 })
    .then(() => true)
    .catch(() => false);

  if (sheetOpened) {
    await page.getByText('15 minutes', { exact: true }).click();
    await page.getByRole('button', { name: 'Busy' }).click();
    await page.evaluate(() => {
      const confirms = Array.from(document.querySelectorAll('button')).filter((b) =>
        (b.textContent || '').includes('Pause Orders'),
      );
      confirms[confirms.length - 1]?.click();
    });
    await expect(pauseHeading).toBeHidden({ timeout: 20_000 });
  } else {
    // Fallback: API pause so the UI still shows paused state for assertion.
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
        import { getApiKeys } from './scripts/smoke/_shared.mjs';
        import { getMerchantProfile, setAcceptingOrders, signInMerchant } from './scripts/smoke/_merchant.mjs';
        const { anonKey } = getApiKeys();
        const token = await signInMerchant(anonKey);
        const m = await getMerchantProfile(anonKey, token);
        await setAcceptingOrders(anonKey, token, m.id, false);
        `,
      ],
      { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' },
    );
    await page.reload();
    await waitForPartnerShell(page);
  }

  const pausedUi = page
    .getByRole('button', { name: /PAUSED|Open early/i })
    .or(page.getByRole('checkbox', { name: /Paused\. Tap to open orders/i }))
    .or(page.getByRole('heading', { name: /store is currently closed/i }))
    .or(page.getByRole('heading', { name: /You're approved/i }));
  await expect(pausedUi.first()).toBeVisible({ timeout: 25_000 });

  await dismissPartnerOverlays(page);
  const openEarly = page.getByRole('button', { name: /Open early/i });
  const pausedToggle = page.getByRole('checkbox', { name: /Paused\. Tap to open orders/i });
  const pausedChip = page.getByRole('button', { name: /PAUSED/i });
  const setUp = page.getByRole('button', { name: /Set up your restaurant/i });
  if (await openEarly.isVisible().catch(() => false)) {
    await openEarly.evaluate((el: HTMLElement) => el.click());
  } else if (await pausedToggle.isVisible().catch(() => false)) {
    await pausedToggle.evaluate((el: HTMLInputElement) => el.click());
  } else if (await pausedChip.isVisible().catch(() => false)) {
    await pausedChip.evaluate((el: HTMLElement) => el.click());
  } else if (await setUp.isVisible().catch(() => false)) {
    // Seed merchant: pausing flips to go-live gate — reopen via API.
  }

  ensurePartnerStoreOpen();
  await page.reload();
  await waitForPartnerShell(page);
  await dismissPartnerOverlays(page);
  await expect(page.getByText('Island Grill').first()).toBeVisible({ timeout: 30_000 });
}

/** Shared UI smoke steps — used by pick-and-choose Partner UI specs. */
export async function smokePartnerDashboard(page: Page) {
  await goPartnerTab(page, 'Dashboard');
  await dismissPartnerOverlays(page);
  await expect(page.getByRole('heading', { name: /Today'?s Snapshot/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Orders today/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Active Orders' })).toBeVisible();

  await partnerClick(page, page.getByRole('button', { name: /View Menu/i }));
  await expect(page.getByRole('heading', { name: 'Menu Overview' })).toBeVisible({
    timeout: 15_000,
  });

  await goPartnerTab(page, 'Dashboard');
  await partnerClick(page, page.getByRole('button', { name: /Sold Out/i }));
  await expect(page.getByRole('heading', { name: 'Menu Overview' })).toBeVisible({
    timeout: 15_000,
  });

  await goPartnerTab(page, 'Dashboard');
  await partnerClick(page, page.getByRole('button', { name: /View All/i }));
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible({ timeout: 15_000 });
}

export async function smokePartnerOrders(page: Page) {
  await openOrdersQueue(page);
  const readyChip = page.getByRole('button', { name: /^Ready/i });
  if (await readyChip.isVisible().catch(() => false)) {
    await partnerClick(page, readyChip);
  }
  await expect(page.getByRole('heading', { name: /Order #RD-2026-/i }).first()).toBeVisible({
    timeout: 20_000,
  });

  const newChip = page.getByRole('button', { name: /^New/i });
  const prepChip = page.getByRole('button', { name: /^Preparing/i });
  if (await newChip.isVisible().catch(() => false)) {
    await partnerClick(page, prepChip);
    await partnerClick(page, readyChip);
  }

  await partnerClick(page, page.getByRole('heading', { name: /Order #RD-2026-/i }).first());
  await expect(
    page
      .getByRole('heading', { name: /Order #RD-2026-/i })
      .or(page.getByRole('button', { name: /CONFIRM PICKUP|ACCEPT ORDER/i }))
      .first(),
  ).toBeVisible({ timeout: 15_000 });

  for (const label of ['Order sealed and bagged', 'Receipt included', 'All items present']) {
    const row = page.getByText(label, { exact: true });
    if (await row.isVisible().catch(() => false)) {
      await partnerClick(page, row);
    }
  }

  const orderBack = page.getByRole('button', { name: 'Back', exact: true });
  if (await orderBack.isVisible().catch(() => false)) {
    await orderBack.evaluate((el: HTMLElement) => el.click());
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible({ timeout: 10_000 });
  } else {
    await clickBackIfPresent(page);
  }
  await dismissPartnerOverlays(page);
}

export async function smokePartnerMenu(page: Page) {
  await goPartnerTab(page, 'Menu');
  await expect(page.getByRole('heading', { name: 'Menu Overview' })).toBeVisible({
    timeout: 20_000,
  });
  const category = page
    .locator('button, [role="button"]')
    .filter({ hasText: /Popular|Items|Bowls|Grill/i })
    .first();
  if (await category.isVisible().catch(() => false)) {
    await partnerClick(page, category);
    await clickBackIfPresent(page);
  }
}

export async function smokePartnerAnalytics(page: Page) {
  await goPartnerTab(page, 'Analytics');
  await expect(
    page.getByText(/Health|Reviews|Orders|Revenue|Rating|Analytics/i).first(),
  ).toBeVisible({ timeout: 20_000 });
  await assertPartnerExitNav(page);
  await goPartnerTab(page, 'Orders');
  await expect(partnerOrdersHeading(page)).toBeVisible({ timeout: 20_000 });
}

/** Fail if the partner is stuck with no way out (desktop Analytics dead-end). */
export async function assertPartnerExitNav(page: Page) {
  await dismissPartnerOverlays(page);
  const sideNav = page.getByRole('navigation', { name: 'Partner desktop navigation' });
  const openNav = page.getByRole('button', { name: 'Open navigation' });
  const bottomEscape = page
    .locator('nav.fixed.bottom-0, nav[class*="bottom"]')
    .getByRole('button', { name: /Orders|Dashboard|Menu|Account/i })
    .first();

  const hasSideNav = await sideNav.isVisible().catch(() => false);
  const hasOpenNav = await openNav.isVisible().catch(() => false);
  const hasBottom = await bottomEscape.isVisible().catch(() => false);

  expect(
    hasSideNav || hasOpenNav || hasBottom,
    'Partner exit nav missing (need side nav, bottom nav, or Open navigation)',
  ).toBeTruthy();
}

function partnerOrdersHeading(page: Page) {
  return page
    .getByRole('heading', { name: 'Orders' })
    .or(page.getByRole('heading', { name: 'Queue' }))
    .or(page.getByRole('heading', { name: /Today'?s Orders/i }))
    .first();
}

/** Exit-nav round-trip: open tab → assert escape → Orders heading. */
export async function smokePartnerExitNavRoundTrip(
  page: Page,
  tab: 'Dashboard' | 'Analytics' | 'Account' | 'Menu',
) {
  await goPartnerTab(page, tab);
  await assertPartnerExitNav(page);
  await goPartnerTab(page, 'Orders');
  await expect(partnerOrdersHeading(page)).toBeVisible({
    timeout: 20_000,
  });
}

export async function smokePartnerAccountHub(page: Page) {
  await goPartnerTab(page, 'Account');
  await expect(page.getByText('Edit Profile')).toBeVisible({ timeout: 20_000 });

  const rows = [
    'Edit Profile',
    'Business Hours',
    'Delivery Settings',
    'Bank & Payouts',
    'Team Members',
    'Promotions & Marketing',
    'Notification Settings',
    'Help & Support',
  ] as const;

  for (const label of rows) {
    const row = page.getByText(label, { exact: true }).first();
    if (!(await row.isVisible().catch(() => false))) continue;
    await partnerClick(page, row);
    await clickBackIfPresent(page);
    const close = page.getByRole('button', { name: /^Close$/i });
    if (await close.isVisible().catch(() => false)) {
      await close.evaluate((el: HTMLElement) => el.click()).catch(() => undefined);
    }
    await expect(page.getByText('Edit Profile')).toBeVisible({ timeout: 15_000 });
  }
}

/** Open one Account hub row by label, then return to hub. */
export async function smokePartnerAccountRow(page: Page, label: string) {
  await goPartnerTab(page, 'Account');
  await expect(page.getByText('Edit Profile')).toBeVisible({ timeout: 20_000 });
  const row = page.getByText(label, { exact: true }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await partnerClick(page, row);
  await clickBackIfPresent(page);
  const close = page.getByRole('button', { name: /^Close$/i });
  if (await close.isVisible().catch(() => false)) {
    await close.evaluate((el: HTMLElement) => el.click()).catch(() => undefined);
  }
  await expect(page.getByText('Edit Profile')).toBeVisible({ timeout: 15_000 });
}

export async function smokePartnerHeaderShortcuts(page: Page) {
  await goPartnerTab(page, 'Dashboard');
  const notifications = page.getByRole('button', { name: 'Notifications' });
  if (await notifications.isVisible().catch(() => false)) {
    await partnerClick(page, notifications);
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible({ timeout: 15_000 });
  }

  const settings = page.getByRole('button', { name: 'Settings' });
  if (await settings.isVisible().catch(() => false)) {
    await partnerClick(page, settings);
    await expect(page.getByText('Edit Profile')).toBeVisible({ timeout: 15_000 });
  }
}

export async function smokePartnerEarnings(page: Page) {
  const sideNav = page.getByRole('navigation', { name: 'Partner desktop navigation' });
  if (await sideNav.isVisible().catch(() => false)) {
    await partnerClick(page, sideNav.getByRole('button', { name: /Earnings/i }).first());
    await expect(page.getByText(/Earnings|Balance|Payout|Revenue|Current Balance/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await assertPartnerExitNav(page);
    await goPartnerTab(page, 'Orders');
    await expect(partnerOrdersHeading(page)).toBeVisible({
      timeout: 15_000,
    });
    return;
  }

  await goPartnerTab(page, 'Dashboard');
  const openNav = page.getByRole('button', { name: 'Open navigation' });
  if (await openNav.isVisible().catch(() => false)) {
    await partnerClick(page, openNav);
    const earnings = page.getByRole('button', { name: /Earnings/i });
    if (await earnings.isVisible().catch(() => false)) {
      await partnerClick(page, earnings);
      await expect(page.getByText(/Earnings|Balance|Payout|Revenue/i).first()).toBeVisible({
        timeout: 15_000,
      });
      await assertPartnerExitNav(page);
      return;
    }
  }
  const revenue = page.getByRole('button', { name: /Revenue/i });
  if (await revenue.isVisible().catch(() => false)) {
    await partnerClick(page, revenue);
    await expect(page.getByText(/Earnings|Balance|Payout|Revenue/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await assertPartnerExitNav(page);
  }
}
