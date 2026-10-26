import { devices, expect, test } from '@playwright/test';
import { standIn } from './plug-stand-in';

const WRONG_BUTTON = 'Signed up with Google or Apple?';

test('a code return joins before garage', async ({ page }) => {
  const hits: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('sb-example-auth-plug-code-verifier', JSON.stringify('test-verifier'));
  });
  await standIn(page);
  await page.route('**/functions/v1/explorer/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/.*\/explorer/, '') || '/';
    hits.push(`${route.request().method()} ${path}`);
    if (path === '/join') {
      await route.fulfill({ json: { ok: true, displayName: 'Test Driver' } });
      return;
    }
    await route.fallback();
  });
  await page.goto('/?code=stand-in-code');
  await expect(page).toHaveURL(/#\/explore/, { timeout: 20_000 });
  await expect(page.getByRole('navigation', { name: 'Plug sections' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toHaveCount(0);
  const joinAt = hits.findIndex((hit) => hit.startsWith('POST /join'));
  const garageAt = hits.findIndex((hit) => hit.includes('/garage'));
  expect(joinAt).toBeGreaterThanOrEqual(0);
  if (garageAt !== -1) expect(joinAt).toBeLessThan(garageAt);
});

async function expectEmail(page: import('@playwright/test').Page) {
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Forgot password' })).toBeVisible();
}

test.describe('iPhone', () => {
  test.use({
    userAgent: devices['iPhone 13'].userAgent,
    viewport: devices['iPhone 13'].viewport,
    isMobile: true,
    hasTouch: true,
  });

  test('iPhone with Apple off shows Google and email only', async ({ page }) => {
    await standIn(page);
    await page.goto('/#/welcome');
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'More ways to sign in' })).toHaveCount(0);
    await expectEmail(page);
  });
});

test('a failed email sign-in explains the other buttons', async ({ page }) => {
  await standIn(page);
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } });
  });
  await page.goto('/#/welcome');
  await page.getByRole('textbox', { name: 'Email' }).fill('driver@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(WRONG_BUTTON);
});
