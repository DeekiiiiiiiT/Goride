import { expect, test } from '@playwright/test';
import { standIn } from './plug-stand-in';

test.beforeEach(async ({ page }) => {
  await standIn(page);
});

test('restroom search opens the nearest place with that facility highlighted', async ({ page }) => {
  await page.goto('/#/explore');
  await page.locator('[data-act="service-category"][data-category="1.4"]').click();
  const near = page.getByRole('button', { name: /Near restroom/ });
  const far = page.getByRole('button', { name: /Far restroom/ });
  await expect(near).toBeVisible();
  await expect(far).toBeVisible();
  const nearBox = await near.boundingBox();
  const farBox = await far.boundingBox();
  expect(nearBox && farBox && nearBox.y < farBox.y).toBeTruthy();
  await near.click();
  await expect(page).toHaveURL(/places\/near-stop\?facility=restroom/);
  await expect(page.getByRole('heading', { name: 'On site' })).toBeVisible();
  await expect(page.locator('li.underline', { hasText: 'Restroom' })).toBeVisible();
});
