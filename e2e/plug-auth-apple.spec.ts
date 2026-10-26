import { devices, expect, test } from '@playwright/test';
import { standIn } from './plug-stand-in';

async function expectEmail(page: import('@playwright/test').Page) {
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Forgot password' })).toBeVisible();
}

test('Android shows Google first and Apple under More ways', async ({ page }) => {
  await standIn(page);
  await page.goto('/#/welcome');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Apple' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More ways to sign in' }).click();
  await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
  await expectEmail(page);
});

test.describe('iPhone', () => {
  test.use({
    userAgent: devices['iPhone 13'].userAgent,
    viewport: devices['iPhone 13'].viewport,
    isMobile: true,
    hasTouch: true,
  });

  test('iPhone with Apple on shows Apple first', async ({ page }) => {
    await standIn(page);
    await page.goto('/#/welcome');
    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
    await page.getByRole('button', { name: 'More ways to sign in' }).click();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expectEmail(page);
  });
});

test.describe('Mac', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
  });

  test('Mac shows Apple and Google together', async ({ page }) => {
    await standIn(page);
    await page.goto('/#/welcome');
    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'More ways to sign in' })).toHaveCount(0);
    await expectEmail(page);
    await expect(page.getByText('Fuel prices, car care')).toHaveCount(0);
    await expect(page.getByText('No ads')).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Roam Plug' })).toBeVisible();
  });
});

test.describe('Windows', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
  });

  test('Windows shows Google first and Apple under More ways', async ({ page }) => {
    await standIn(page);
    await page.goto('/#/welcome');
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toHaveCount(0);
    await page.getByRole('button', { name: 'More ways to sign in' }).click();
    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
    await expectEmail(page);
  });
});
