import { test } from '@playwright/test';
import {
  signInPartner,
  smokePartnerExitNavRoundTrip,
  smokePartnerAnalytics,
  smokePartnerEarnings,
} from './helpers/rush-partner';

test.describe('Partner UI — exit navigation', () => {
  test.beforeEach(async ({ page }) => {
    await signInPartner(page);
  });

  test('analytics has exit nav and reaches Orders', async ({ page }) => {
    await smokePartnerAnalytics(page);
  });

  test('dashboard exit-nav round-trip to Orders', async ({ page }) => {
    await smokePartnerExitNavRoundTrip(page, 'Dashboard');
  });

  test('account exit-nav round-trip to Orders', async ({ page }) => {
    await smokePartnerExitNavRoundTrip(page, 'Account');
  });

  test('menu exit-nav round-trip to Orders', async ({ page }) => {
    await smokePartnerExitNavRoundTrip(page, 'Menu');
  });

  test('earnings exit-nav round-trip to Orders', async ({ page }) => {
    await smokePartnerEarnings(page);
  });
});
