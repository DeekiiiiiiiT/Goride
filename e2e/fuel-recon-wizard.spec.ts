import { test, expect, type Page } from '@playwright/test';
import { FLEET_ALLOW_FINALIZE, hasFleetE2ECreds, signInFleet } from './helpers/fleet-auth';

/**
 * Week Reconciliation step 5 "Fuel" (fuel enterprise audit Part J, 23 Nov 2026) on a real
 * signed-in fleet account. The old Fuel-page wizard (Data quality → … → "Finalize week") is gone:
 * fuel weeks close only in Week Reconciliation (F-28), in five parts.
 *
 * Env: E2E_FLEET_EMAIL, E2E_FLEET_PASSWORD
 * Optional: E2E_FUEL_WEEK (YYYY-MM-DD Monday), E2E_FUEL_LINE (rideshare | rush_delivery),
 *           E2E_FUEL_ALLOW_FINALIZE=1 (locks the week for real)
 */
const PARTS = [
  ['checks', '1 Fuel checks'],
  ['disputes', '2 Disputes'],
  ['policy', '3 Fuel policy'],
  ['distance', '4 Distance and who pays'],
  ['finalize', '5 Finalize'],
] as const;

/** Words Stitch made up that must never reach the screen (Part J0). */
const NEVER_SHOWN = [
  'Telematics',
  'telematics',
  'GPS Synchronized',
  'Audit Stage',
  'Institutional Ledger',
  'Zero-Drift',
  'Apportion',
  'paper pump slips',
  'Texaco',
  'Ledger Hold',
  'Seal Refused',
];

async function openFuelStep(page: Page, week: string) {
  const line = process.env.E2E_FUEL_LINE?.trim() === 'rush_delivery' ? 'rush_delivery' : 'rideshare';
  await page.goto(`/week-reconciliation?line=${line}&week=${week}&step=fuel`);
  await expect(page.getByTestId('recon-week-desk')).toBeVisible({ timeout: 120_000 });
  // A week whose inputs aren't in yet opens step 5 read-only; nothing below applies.
  const lockedStep = page.getByTestId('recon-locked-step');
  const slides = page.getByTestId('recon-fuel-slides');
  await expect(lockedStep.or(slides)).toBeVisible({ timeout: 120_000 });
  test.skip(await lockedStep.isVisible(), `Week ${week}: step 5 is waiting on earlier steps`);
}

async function openPart(page: Page, id: (typeof PARTS)[number][0]) {
  await page.getByTestId(`recon-fuel-part-${id}`).click();
  await expect(page.getByTestId(`recon-fuel-part-${id}`)).toHaveAttribute('aria-selected', 'true');
}

async function expectNoInventedWords(page: Page) {
  const text = (await page.locator('body').innerText()) || '';
  for (const w of NEVER_SHOWN) expect(text, `"${w}" must not be shown`).not.toContain(w);
}

test.describe('Fuel — Week Reconciliation step 5', () => {
  test.skip(!hasFleetE2ECreds(), 'E2E_FLEET_EMAIL / E2E_FLEET_PASSWORD not set');

  test('the old Fuel reconciliation link lands on Week Reconciliation', async ({ page }) => {
    await signInFleet(page);
    await page.goto('/fuel-reconciliation');
    // recon_v2 is on for every company (F-28): the bookmark opens the Week Reconciliation hub.
    await expect(page.getByTestId('recon-week-list').or(page.getByTestId('recon-week-desk'))).toBeVisible({
      timeout: 120_000,
    });
  });

  test('five parts with their full names; each part opens', async ({ page }) => {
    const week = process.env.E2E_FUEL_WEEK?.trim();
    test.skip(!week, 'E2E_FUEL_WEEK not set');
    await signInFleet(page);
    await openFuelStep(page, week!);
    for (const [id, name] of PARTS) {
      await expect(page.getByTestId(`recon-fuel-part-${id}`)).toContainText(name);
    }

    await openPart(page, 'checks');
    await expect(page.getByTestId('fuel-checks')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('fuel-checks')).toContainText('Fills that need a look before the week can lock.');

    await openPart(page, 'distance');
    await expect(page.getByTestId('who-pays')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('who-pays-chip').first()).toHaveText(/Charged|Preview — not charged|Priced the old way/);

    await openPart(page, 'finalize');
    await expect(page.getByTestId('recon-fuel-seal')).toBeVisible({ timeout: 60_000 });
    await expectNoInventedWords(page);
  });

  test('Finalize stays off while anything is still open', async ({ page }) => {
    const week = process.env.E2E_FUEL_WEEK?.trim();
    test.skip(!week, 'E2E_FUEL_WEEK not set');
    await signInFleet(page);
    await openFuelStep(page, week!);
    await openPart(page, 'finalize');
    const seal = page.getByTestId('recon-fuel-seal');
    await expect(seal).toBeVisible({ timeout: 60_000 });
    test.skip(/Locked/.test(await seal.innerText()), 'This week is already locked');
    const stillOpen = page.getByTestId('recon-fuel-still-open');
    test.skip(!(await stillOpen.isVisible()), 'Nothing is open this week');
    const rows = stillOpen.getByTestId('recon-fuel-still-open-row');
    const count = await rows.count();
    await expect(seal).toContainText(count === 1 ? '1 thing still open' : `${count} things still open`);
    await expect(page.getByTestId('recon-finalize-fuel')).toBeDisabled();
    // Each "Go to" button opens the part that fixes the row.
    const go = stillOpen.getByRole('button', { name: /^Go to / }).first();
    if (await go.isVisible()) {
      const label = (await go.innerText()).replace(/^Go to\s+/, '').trim();
      await go.click();
      const target = PARTS.find(([, n]) => n.slice(2) === label)?.[0];
      if (target) await expect(page.getByTestId(`recon-fuel-part-${target}`)).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('Finalize locks the week, or says plainly that nothing was locked', async ({ page }) => {
    test.skip(!FLEET_ALLOW_FINALIZE, 'E2E_FUEL_ALLOW_FINALIZE!=1');
    const week = process.env.E2E_FUEL_WEEK?.trim();
    test.skip(!week, 'E2E_FUEL_WEEK not set');
    await signInFleet(page);
    await openFuelStep(page, week!);
    await openPart(page, 'finalize');
    const tick = page.getByRole('checkbox');
    if (await tick.isVisible()) await tick.check();
    const finalize = page.getByTestId('recon-finalize-fuel');
    await expect(finalize).toBeEnabled({ timeout: 60_000 });
    await finalize.click();
    await expect(
      page.getByTestId('recon-fuel-seal').getByText('Locked').or(page.getByTestId('recon-fuel-refused')),
    ).toBeVisible({ timeout: 180_000 });
  });
});

test.describe('Fuel — Fleet Policy Rules', () => {
  test.skip(!hasFleetE2ECreds(), 'E2E_FLEET_EMAIL / E2E_FLEET_PASSWORD not set');

  test('six kinds of driving, versions, and a locked week refused in Add a version', async ({ page }) => {
    await signInFleet(page);
    await page.goto('/fuel-configuration');
    const rows = page.getByTestId('policy-split-rows').first();
    await expect(rows).toBeVisible({ timeout: 120_000 });
    for (const label of ['Uber trips', 'Driving to pickups', 'Commute', 'Company errands', 'Personal driving', 'Km nobody can explain']) {
      await expect(rows).toContainText(label);
    }
    const versions = page.getByTestId('policy-versions').first();
    await expect(versions).toBeVisible();
    const add = versions.getByRole('button', { name: /Add a version/ });
    test.skip(!(await add.isVisible()), 'No editable policy');
    await add.click();
    const dlg = page.getByTestId('add-fuel-version');
    await expect(dlg).toBeVisible();
    // The first option is 8 weeks back: if that week is locked, the dialog must refuse it.
    const select = dlg.getByLabel('Applies from');
    const first = await select.locator('option').first().getAttribute('value');
    await select.selectOption(first!);
    const uber = dlg.getByLabel('Uber trips — company pays');
    const now = Number(await uber.inputValue());
    await uber.fill(String(now >= 100 ? now - 1 : now + 1));
    const error = dlg.getByTestId('add-fuel-version-error');
    if (await error.isVisible()) {
      await expect(error).toContainText(/That week is already locked\. Choose the week of .+ or later\.|Choose a week after/);
      await expect(dlg.getByRole('button', { name: /Add version/ })).toBeDisabled();
    }
    // Never saved here: Cancel.
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(dlg).toBeHidden();
    await expectNoInventedWords(page);
  });
});
