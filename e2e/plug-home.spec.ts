import { expect, test } from '@playwright/test';
import { standIn } from './plug-stand-in';

const KINDS = [
  ['Mechanic', 'mechanic'],
  ['Parts store', 'parts_store'],
  ['Fuel station', 'fuel'],
  ['Tyres & air', 'tyre_air'],
  ['Car wash', 'car_wash'],
  ['Restroom', 'restroom'],
  ['Toll', 'toll'],
  ['Roadside help', 'roadside'],
] as const;

test.beforeEach(async ({ page }) => {
  await standIn(page, { persist: true });
});

test('Explore opens on everything nearby', async ({ page }) => {
  await page.goto('/#/explore');
  await expect(page.getByText('All near you')).toBeVisible();
  await expect(page.getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'E-10 87' })).toHaveCount(0);
  await page.getByRole('button', { name: /Mechanics/ }).click();
  await expect(page.getByRole('button', { name: /Mechanics/, pressed: true })).toBeVisible();
  await expect(page.getByText('No mechanics mapped near you yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Map one' })).toBeVisible();
  await page.getByRole('button', { name: /Mechanics/ }).click();
  await expect(page.getByRole('button', { pressed: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Fuel prices/ }).click();
  await expect(page.getByRole('button', { name: 'E-10 87' })).toBeVisible();
  await expect(page.getByText('Total Half Way Tree')).toBeVisible();
});

test('each place kind submits its details', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  const bodies: Array<{ kind?: string; name?: string; phone?: string }> = [];
  await page.route('**/functions/v1/explorer/pins', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { placeId: 'pin-1', status: 'pending', photo: false } });
  });
  for (const [label, kind] of KINDS) {
    await page.goto('/#/map', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#categoryGrid [role="radio"]')).toHaveCount(8);
    await page.locator(`[role="radio"][data-kind="${kind}"]`).evaluate((el) => (el as HTMLButtonElement).click());
    await expect(page).toHaveURL(/\/map\/pin$/);
    await page.locator('[data-act="confirm-pin-location"]').evaluate((el) => (el as HTMLButtonElement).click());
    await page.locator('#place-name').fill(`Test ${label}`);
    await page.locator('#phone-number').fill('8765550199');
    const before = bodies.length;
    await page.getByRole('button', { name: /Submit for Review/ }).click();
    await expect.poll(() => bodies.length).toBe(before + 1);
    await expect(page.getByRole('status')).toContainText('Sent for review');
    expect(bodies.at(-1)?.kind).toBe(kind);
    expect(bodies.at(-1)?.name).toBe(`Test ${label}`);
    expect(bodies.at(-1)?.phone).toBe('8765550199');
  }
});

test('signed-in sections answer with the person own data or an empty state', async ({ page }) => {
  const hits: string[] = [];
  await page.route('**/functions/v1/explorer/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/.*\/explorer/, '') || '/';
    hits.push(`${route.request().method()} ${path}`);
    await route.fallback();
  });
  await page.goto('/#/garage');
  await expect(page.getByText(/No cars yet|Add a car|Your garage|Garage/i).first()).toBeVisible();
  await page.goto('/#/parts');
  await expect(page.locator('[data-plug-screen]').first()).toBeVisible();
  await page.goto('/#/tolls');
  await expect(page.locator('[data-plug-screen]').first()).toBeVisible();
  await page.goto('/#/contributions');
  await expect(page.getByText(/No places yet|Pending|Approved|Waiting/i).first()).toBeVisible();
  expect(hits.some((hit) => hit.includes('/garage') || hit.includes('/contributions') || hit.includes('/flags'))).toBe(true);
});
