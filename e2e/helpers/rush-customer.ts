import { expect, type Page } from '@playwright/test';

const CUSTOMER_EMAIL =
  process.env.RUSH_CUSTOMER_EMAIL?.trim() || 'seed-customer@roamrush.app';
const CUSTOMER_PASSWORD =
  process.env.RUSH_CUSTOMER_PASSWORD?.trim() || 'RoamRushCustomer2026!';
const DELIVERY_ADDRESS =
  process.env.RUSH_DELIVERY_ADDRESS?.trim() || '12 Burke Rd, Spanish Town';

/** Clear local cart/session so each smoke run starts clean. */
export async function resetCustomerStorage(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('roam-dash-cart');
      // Keep onboarding flag if present — address step still handled below when needed.
    } catch {
      /* ignore */
    }
  });
}

export async function signInCustomer(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'I already have an account' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill(CUSTOMER_EMAIL);
  await page.getByRole('textbox', { name: 'Password' }).fill(CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Seed account may land on address onboarding after a fresh session.
  const addressHeading = page.getByRole('heading', { name: 'Where should we deliver?' });
  const homeSearch = page.getByRole('button', { name: /Search restaurants/i });
  await Promise.race([
    addressHeading.waitFor({ state: 'visible', timeout: 20_000 }),
    homeSearch.waitFor({ state: 'visible', timeout: 20_000 }),
  ]);

  if (await addressHeading.isVisible().catch(() => false)) {
    await completeDeliveryAddress(page);
  }

  await expect(page.getByRole('heading', { name: 'Popular near you' })).toBeVisible({
    timeout: 30_000,
  });
}

async function completeDeliveryAddress(page: Page) {
  await page.getByRole('textbox', { name: 'Search for your address' }).fill(DELIVERY_ADDRESS);
  // Maps key may be missing in prod; Confirm still enables with typed fallback.
  await page.getByRole('button', { name: 'Confirm Address' }).click({ timeout: 10_000 });
  await page.getByRole('heading', { name: 'Delivery Details' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Save Address' }).click();
}

/** Restaurant menu uses icon-only add buttons next to the dish name. */
export async function addFirstMenuItem(page: Page) {
  const addBtn = page
    .locator('main')
    .locator('button')
    .filter({ has: page.locator('text=add') })
    .first();
  await expect(addBtn).toBeVisible({ timeout: 20_000 });
  await addBtn.click();
}

export async function goBackFromStore(page: Page) {
  // Floating "View cart" bar can intercept normal clicks on the back control.
  await page.evaluate(() => {
    const back = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('arrow_back'),
    );
    back?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
}
