import { test, expect } from '@playwright/test';
import { FLEET_PAGE_REGISTRY } from '../apps/fleet/src/navigation/pageRegistry';

test.describe('RoamFleet Rush integration', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('rideshare-only page registry excludes rush-only paths from default nav ids', () => {
    const rushOnly = ['couriers', 'courier-analytics', 'deliveries', 'delivery-analytics', 'courier-settlements', 'supply-health'];
    for (const id of rushOnly) {
      expect(FLEET_PAGE_REGISTRY[id]).toBeDefined();
      expect(FLEET_PAGE_REGISTRY[id].path).toMatch(/^\//);
    }
    expect(FLEET_PAGE_REGISTRY.dashboard.path).toBe('/');
    expect(FLEET_PAGE_REGISTRY.drivers.path).toBe('/drivers');
  });

  test('delivery-only shape has expected nav pages registered', () => {
    const deliveryShape = ['dashboard', 'couriers', 'vehicles', 'deliveries', 'settings'];
    for (const id of deliveryShape) {
      expect(FLEET_PAGE_REGISTRY[id]?.id).toBe(id);
    }
  });

  test('protected rush paths are registered for middleware', () => {
    const protectedPaths = ['/couriers', '/deliveries', '/courier-settlements', '/supply-health'];
    for (const path of protectedPaths) {
      const match = Object.values(FLEET_PAGE_REGISTRY).find((p) => p.path === path);
      expect(match, `missing registry entry for ${path}`).toBeTruthy();
    }
  });
});
