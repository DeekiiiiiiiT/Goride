/**
 * Fleet Playwright auth — skip when E2E_FLEET_EMAIL / E2E_FLEET_PASSWORD unset.
 */
import { expect, type Page } from '@playwright/test';

export const FLEET_E2E_EMAIL = process.env.E2E_FLEET_EMAIL?.trim() || '';
export const FLEET_E2E_PASSWORD = process.env.E2E_FLEET_PASSWORD?.trim() || '';
export const FLEET_ALLOW_FINALIZE = process.env.E2E_FUEL_ALLOW_FINALIZE === '1';

export function hasFleetE2ECreds(): boolean {
  return Boolean(FLEET_E2E_EMAIL && FLEET_E2E_PASSWORD);
}

/** Sign in to fleet app (email/password form on /). */
export async function signInFleet(page: Page) {
  if (!hasFleetE2ECreds()) {
    throw new Error('E2E_FLEET_EMAIL and E2E_FLEET_PASSWORD are required');
  }
  await page.goto('/');
  const email = page.getByRole('textbox', { name: /email/i }).or(page.locator('input[type="email"]'));
  const password = page
    .getByRole('textbox', { name: /password/i })
    .or(page.locator('input[type="password"]'));
  await email.first().fill(FLEET_E2E_EMAIL);
  await password.first().fill(FLEET_E2E_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).first().click();
  await expect(page.locator('body')).toBeVisible({ timeout: 30_000 });
  // Sidebar / shell after auth
  await expect(
    page.getByText(/Consumption Reconciliation|Dashboard|Fuel/i).first(),
  ).toBeVisible({ timeout: 60_000 });
}

export async function openFuelReconciliation(
  page: Page,
  opts?: { week?: string; step?: string },
) {
  const q = new URLSearchParams();
  if (opts?.week) q.set('week', opts.week);
  if (opts?.step) q.set('step', opts.step);
  const qs = q.toString();
  await page.goto(`/fuel-reconciliation${qs ? `?${qs}` : ''}`);
}
