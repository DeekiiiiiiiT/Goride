import { test, expect } from '@playwright/test';
import {
  canSeeCourierOps,
  canSeeEarningsPolicy,
  hasSharedOps,
} from '../apps/fleet/src/components/layout/sidebarGating';
import { FLEET_PAGE_REGISTRY } from '../apps/fleet/src/navigation/pageRegistry';

test.describe('RoamFleet Rush integration', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('rideshare-only shape hides Rush nav gating', () => {
    expect(
      canSeeCourierOps({
        hasRushDeliveryLine: false,
        rushModuleEnabled: true,
        canViewAnyCourierPage: true,
      }),
    ).toBe(false);
    expect(FLEET_PAGE_REGISTRY.dashboard.path).toBe('/');
    expect(FLEET_PAGE_REGISTRY.drivers.path).toBe('/drivers');
  });

  test('delivery-only shape exposes shared ops and earnings policy', () => {
    expect(hasSharedOps({ rushVisible: true, rideshareVisible: false })).toBe(true);
    expect(
      canSeeEarningsPolicy({
        hasSharedOps: true,
        sidebarVisible: true,
        canView: true,
      }),
    ).toBe(true);
    const deliveryShape = ['dashboard', 'couriers', 'vehicles', 'deliveries', 'settings'];
    for (const id of deliveryShape) {
      expect(FLEET_PAGE_REGISTRY[id]?.id).toBe(id);
    }
  });

  test('both-lines shape registers scope-filtered pages', () => {
    const bothShape = ['dashboard', 'drivers', 'couriers', 'deliveries', 'trips', 'settings'];
    for (const id of bothShape) {
      expect(FLEET_PAGE_REGISTRY[id]).toBeTruthy();
    }
    expect(
      canSeeCourierOps({
        hasRushDeliveryLine: true,
        rushModuleEnabled: true,
        canViewAnyCourierPage: true,
      }),
    ).toBe(true);
  });

  test('composition: default platform + both-lines org enables rush_couriers', async () => {
    const { resolveEffectiveModules, rushModuleOverridesForServiceLines, DEFAULT_ENTERPRISE_ENABLED_MODULES } =
      await import('@roam/platform-settings');
    const org = rushModuleOverridesForServiceLines(['rideshare', 'rush_delivery'], {});
    const effective = resolveEffectiveModules({ ...DEFAULT_ENTERPRISE_ENABLED_MODULES }, org);
    expect(effective.rush_couriers).toBe(true);
    const killed = resolveEffectiveModules(
      { ...DEFAULT_ENTERPRISE_ENABLED_MODULES, rush_couriers: false },
      org,
    );
    expect(killed.rush_couriers).toBe(false);
  });

  test('protected rush paths are registered for middleware', () => {
    const protectedPaths = ['/couriers', '/deliveries', '/courier-settlements', '/supply-health'];
    for (const path of protectedPaths) {
      const match = Object.values(FLEET_PAGE_REGISTRY).find((p) => p.path === path);
      expect(match, `missing registry entry for ${path}`).toBeTruthy();
    }
  });
});

test.describe('RoamFleet browser smoke (fleet project)', () => {
  test('login shell loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('rideshare-only org — drivers path registered', async () => {
    expect(FLEET_PAGE_REGISTRY.drivers.path).toBe('/drivers');
    expect(
      canSeeCourierOps({
        hasRushDeliveryLine: false,
        rushModuleEnabled: true,
        canViewAnyCourierPage: true,
      }),
    ).toBe(false);
  });

  test('delivery-only org — couriers path registered', async () => {
    expect(FLEET_PAGE_REGISTRY.couriers.path).toBe('/couriers');
    expect(hasSharedOps({ rushVisible: true, rideshareVisible: false })).toBe(true);
  });

  test('signup deep link ?line=rush_delivery loads', async ({ page }) => {
    await page.goto('/signup?line=rush_delivery');
    await expect(page.locator('body')).toBeVisible();
    const url = page.url();
    expect(url).toContain('line=rush_delivery');
  });

  test('both-lines org — scope pages exist', async () => {
    expect(FLEET_PAGE_REGISTRY.drivers).toBeTruthy();
    expect(FLEET_PAGE_REGISTRY.couriers).toBeTruthy();
    expect(FLEET_PAGE_REGISTRY.deliveries).toBeTruthy();
  });
});
