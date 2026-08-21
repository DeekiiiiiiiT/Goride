import { expect, type Page } from '@playwright/test';

const CUSTOMER_EMAIL =
  process.env.RUSH_CUSTOMER_EMAIL?.trim() || 'seed-customer@roamrush.app';
const CUSTOMER_PASSWORD =
  process.env.RUSH_CUSTOMER_PASSWORD?.trim() || 'RoamRushCustomer2026!';
const DELIVERY_ADDRESS =
  process.env.RUSH_DELIVERY_ADDRESS?.trim() || '12 Burke Rd, Spanish Town';

export type CustomerTab = 'Home' | 'Search' | 'Orders' | 'Account';

/** Account hub rows → landing heading after open. */
const ACCOUNT_ROW_LANDINGS: { label: string; heading: string | RegExp }[] = [
  { label: 'Edit Profile', heading: 'Edit Profile' },
  { label: 'Addresses', heading: 'Saved Addresses' },
  { label: 'Payment Methods', heading: 'Payment Methods' },
  { label: 'Promotions & Rewards', heading: 'Promotions' },
  { label: 'Favorites', heading: 'Your Favorites' },
  { label: 'Notification Settings', heading: 'Notifications' },
  { label: 'Help & Support', heading: 'Help' },
  { label: 'About', heading: 'About' },
];

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
    .locator('main, [class*="min-h"]')
    .locator('button')
    .filter({ has: page.locator('text=add') })
    .first()
    .or(page.locator('button').filter({ has: page.locator('text=add') }).first());
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

/** Click bottom nav tab by visible label. */
export async function goCustomerTab(page: Page, tab: CustomerTab) {
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
  expect(clicked, `bottom nav tab "${tab}"`).toBe(true);
  await page.waitForTimeout(400);
}

export async function clickBackIfPresent(page: Page) {
  const back = page
    .getByRole('button', { name: /Back|Go back|arrow_back/i })
    .or(page.locator('button').filter({ has: page.locator('text=arrow_back') }))
    .first();
  if (await back.isVisible().catch(() => false)) {
    await back.evaluate((el: HTMLElement) => el.click()).catch(async () => {
      await back.click({ force: true });
    });
    await page.waitForTimeout(400);
  }
}

/**
 * Open a seeded store card from Home.
 * Prefer "Island Grill Jamaican…" so Active Order banner (also says Island Grill) is not clicked.
 */
export async function openSeedStore(page: Page, name: RegExp = /Island Grill Jamaican/i) {
  await goCustomerTab(page, 'Home');
  await expect(page.getByRole('heading', { name: 'Popular near you' })).toBeVisible({
    timeout: 20_000,
  });
  // Scope below Popular near you — avoids Active Order / reorder chips.
  const storeCard = page
    .getByRole('heading', { name: 'Popular near you' })
    .locator('..')
    .getByRole('button', { name })
    .first()
    .or(page.getByRole('button', { name }).first());
  await expect(storeCard).toBeVisible({ timeout: 20_000 });
  await storeCard.click();

  // If an active-order Track screen opened by mistake, back out and retry the card.
  const track = page.getByRole('heading', { name: 'Track Order' });
  if (await track.isVisible().catch(() => false)) {
    await clickBackIfPresent(page);
    await page.getByRole('button', { name }).first().click();
  }

  await expect(page.getByRole('heading', { name: /Island Grill|Green Life/i, level: 1 })).toBeVisible({
    timeout: 20_000,
  });
}

/** Add first menu item and open the cart sheet/page. */
export async function openCartWithItem(page: Page) {
  await openSeedStore(page);
  await addFirstMenuItem(page);
  const viewCart = page.getByRole('button', { name: /View cart/i });
  await expect(viewCart).toBeVisible({ timeout: 15_000 });
  await viewCart.click();
  await expect(page.getByRole('heading', { name: 'Your Cart' })).toBeVisible({ timeout: 15_000 });
}

/**
 * Reach Checkout from a cart with items. Asserts key sections.
 * Does NOT click Place Order.
 */
export async function openCheckoutReadOnly(page: Page) {
  await openCartWithItem(page);
  await page.getByRole('button', { name: /Go to Checkout/i }).click();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Delivery Address' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Payment Method' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Order Summary' })).toBeVisible();
  await expect(page.getByText('Place Order', { exact: true })).toBeVisible();
}

/** Bottom-nav round-trip: Home → Search → Orders → Account → Home. */
export async function smokeCustomerShell(page: Page) {
  await goCustomerTab(page, 'Home');
  await expect(page.getByRole('heading', { name: 'Popular near you' })).toBeVisible({
    timeout: 20_000,
  });

  await goCustomerTab(page, 'Search');
  await expect(page.getByRole('heading', { name: 'What are you craving?' })).toBeVisible({
    timeout: 15_000,
  });

  await goCustomerTab(page, 'Orders');
  await expect(page.getByRole('heading', { name: 'Your Orders' })).toBeVisible({
    timeout: 15_000,
  });

  await goCustomerTab(page, 'Account');
  await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible({
    timeout: 15_000,
  });

  await goCustomerTab(page, 'Home');
  await expect(page.getByRole('heading', { name: 'Popular near you' })).toBeVisible({
    timeout: 15_000,
  });
}

export async function smokeCustomerHome(page: Page) {
  await goCustomerTab(page, 'Home');
  await expect(page.getByRole('heading', { name: 'Popular near you' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText(/Deliver to ·|Set delivery address/i).first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Search restaurants/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Food$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Grocery$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Convenience$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pharmacy$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Island Grill/i }).first()).toBeVisible({
    timeout: 20_000,
  });
}

export async function smokeCustomerSearch(page: Page) {
  await goCustomerTab(page, 'Search');
  await expect(page.getByRole('heading', { name: 'What are you craving?' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { name: 'Browse Categories' })).toBeVisible();
  await expect(page.getByText('Trending').first()).toBeVisible();

  const deals = page.getByText('Deals Near You').first();
  if (await deals.isVisible().catch(() => false)) {
    await deals.click();
    await expect(page.getByRole('heading', { name: 'Deals Near You' })).toBeVisible({
      timeout: 15_000,
    });
    // Deals is a Search-mode screen (bottom nav stays) — re-open Search browse.
    await goCustomerTab(page, 'Search');
    await expect(page.getByRole('heading', { name: 'What are you craving?' })).toBeVisible({
      timeout: 15_000,
    });
  }

  const searchBox = page.getByRole('textbox').first();
  if (await searchBox.isVisible().catch(() => false)) {
    await searchBox.fill('jerk');
    await page.waitForTimeout(800);
  }
}

export async function smokeCustomerStore(page: Page) {
  await openSeedStore(page, /Island Grill Jamaican/i);
  await expect(page.getByRole('heading', { name: 'Island Grill', level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  const addBtn = page.locator('button').filter({ has: page.locator('text=add') }).first();
  await expect(addBtn).toBeVisible({ timeout: 20_000 });
  await goBackFromStore(page);
  await expect(page.getByRole('heading', { name: 'Popular near you' })).toBeVisible({
    timeout: 15_000,
  });
}

export async function smokeCustomerCart(page: Page) {
  // Empty cart path via Orders? Better: open cart with item (seed always has menu).
  await openCartWithItem(page);
  await expect(page.getByRole('heading', { name: 'Order Items' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Order Summary' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Go to Checkout/i })).toBeVisible();
}

export async function smokeCustomerCheckout(page: Page) {
  await openCheckoutReadOnly(page);
  // Explicitly do not click Place Order — leave via back.
  await clickBackIfPresent(page);
}

export async function smokeCustomerOrders(page: Page) {
  await goCustomerTab(page, 'Orders');
  await expect(page.getByRole('heading', { name: 'Your Orders' })).toBeVisible({
    timeout: 20_000,
  });

  const empty = page.getByText('No orders yet');
  const past = page.getByRole('heading', { name: 'Past orders' });
  const active = page.getByRole('heading', { name: 'Active orders' });

  if (await empty.isVisible().catch(() => false)) {
    return;
  }

  await expect(past.or(active).first()).toBeVisible({ timeout: 10_000 });

  // Open first past/active order card if present — read-only Order Details.
  const orderCard = page.locator('main button, main [role="button"]').filter({
    hasText: /Order|RD-|JMD|\$/,
  }).first();
  if (await orderCard.isVisible().catch(() => false)) {
    await orderCard.click();
    const details = page.getByRole('heading', { name: 'Order Details' });
    if (await details.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)) {
      await clickBackIfPresent(page);
      await expect(page.getByRole('heading', { name: 'Your Orders' })).toBeVisible({
        timeout: 15_000,
      });
    }
  }
}

/** Open every Account hub row + Edit Profile; return to hub each time. Never Sign Out. */
export async function smokeCustomerAccountHub(page: Page) {
  await goCustomerTab(page, 'Account');
  await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible({
    timeout: 20_000,
  });
  // Sign Out label present but do not click.
  await expect(page.getByText('Sign Out', { exact: true })).toBeVisible();

  for (const { label, heading } of ACCOUNT_ROW_LANDINGS) {
    await goCustomerTab(page, 'Account');
    await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible({
      timeout: 15_000,
    });

    if (label === 'Edit Profile') {
      await page.getByRole('button', { name: 'Edit Profile' }).click();
    } else {
      const row = page.getByText(label, { exact: true }).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.click();
    }

    await expect(
      page.getByRole('heading', { name: heading, exact: typeof heading === 'string' }).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    await clickBackIfPresent(page);
    await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible({
      timeout: 15_000,
    });
  }
}

/** Open one Account row by label, assert landing, return to hub. */
export async function smokeCustomerAccountRow(page: Page, label: string) {
  const landing = ACCOUNT_ROW_LANDINGS.find((r) => r.label === label);
  expect(landing, `unknown account row: ${label}`).toBeTruthy();

  await goCustomerTab(page, 'Account');
  await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible({
    timeout: 20_000,
  });

  if (label === 'Edit Profile') {
    await page.getByRole('button', { name: 'Edit Profile' }).click();
  } else {
    const row = page.getByText(label, { exact: true }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
  }

  await expect(
    page
      .getByRole('heading', {
        name: landing!.heading,
        exact: typeof landing!.heading === 'string',
      })
      .first(),
  ).toBeVisible({
    timeout: 15_000,
  });
}

export async function smokeCustomerHeaderBell(page: Page) {
  await goCustomerTab(page, 'Account');
  // Header notifications icon (no accessible name on Account — Material icon only).
  const bell = page.locator('header button').filter({ has: page.locator('text=notifications') }).first();
  if (await bell.isVisible().catch(() => false)) {
    await bell.click();
  } else {
    // Home header has aria-label.
    await goCustomerTab(page, 'Home');
    await page.getByRole('button', { name: /Notification settings/i }).click();
  }
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await clickBackIfPresent(page);
}

export async function smokeCustomerProfile(page: Page) {
  await smokeCustomerAccountRow(page, 'Edit Profile');
  await expect(page.getByLabel(/First name/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel(/Last name/i)).toBeVisible();
  await clickBackIfPresent(page);
  await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible({
    timeout: 15_000,
  });
}

export async function smokeCustomerAddresses(page: Page) {
  await smokeCustomerAccountRow(page, 'Addresses');
  await expect(page.getByRole('button', { name: /Add New Address/i })).toBeVisible();
  await page.getByRole('button', { name: /Add New Address/i }).click();
  await expect(page.getByRole('heading', { name: 'Add Address' })).toBeVisible({
    timeout: 15_000,
  });
  // Do not save — back out.
  await clickBackIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Saved Addresses' })).toBeVisible({
    timeout: 15_000,
  });
  await clickBackIfPresent(page);
}

export async function smokeCustomerPayment(page: Page) {
  await smokeCustomerAccountRow(page, 'Payment Methods');
  await expect(page.getByText('Checkout options')).toBeVisible();
  await expect(page.getByText('WiPay', { exact: true })).toBeVisible();
  await expect(page.getByText('PayPal', { exact: true })).toBeVisible();
  await expect(page.getByText('Cash on delivery')).toBeVisible();
  await clickBackIfPresent(page);
}

export async function smokeCustomerPromotions(page: Page) {
  await smokeCustomerAccountRow(page, 'Promotions & Rewards');
  await expect(page.getByText('Enter promo code')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
  await clickBackIfPresent(page);
}

export async function smokeCustomerFavorites(page: Page) {
  await smokeCustomerAccountRow(page, 'Favorites');
  await expect(page.getByRole('button', { name: 'Restaurants', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Items', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Items', exact: true }).click();
  await page.getByRole('button', { name: 'Restaurants', exact: true }).click();
  await clickBackIfPresent(page);
}

export async function smokeCustomerNotifications(page: Page) {
  await smokeCustomerAccountRow(page, 'Notification Settings');
  await expect(page.getByRole('heading', { name: 'Push Notifications' })).toBeVisible();
  await expect(page.getByText('Order updates')).toBeVisible();
  await clickBackIfPresent(page);
}

export async function smokeCustomerHelp(page: Page) {
  await smokeCustomerAccountRow(page, 'Help & Support');
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Order Help', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account Issues', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Payment Issues', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Safety', exact: true })).toBeVisible();
  await clickBackIfPresent(page);
}

export async function smokeCustomerAbout(page: Page) {
  await smokeCustomerAccountRow(page, 'About');
  await expect(page.getByRole('heading', { name: 'Roam Rush' }).first()).toBeVisible();
  await expect(page.getByText('Cravings. Delivered.')).toBeVisible();
  await clickBackIfPresent(page);
}
