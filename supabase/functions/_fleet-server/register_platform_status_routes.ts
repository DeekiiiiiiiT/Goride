/**
 * Peeled from index.tsx — Wave F0. Behavior unchanged.
 */
import type { Hono } from "npm:hono@4.3.11";
import { resolveProductLine } from "./product_line.ts";
import {
  resolveSettingsSegment,
  getPlatformSettingsCached,
  buildPlatformStatusPayload,
} from "./platform_settings.ts";

export function registerPlatformStatusRoutes(app: Hono) {
  // Public endpoint: GET /platform-status (no auth required)
  app.get("/make-server-37f42386/platform-status", async (c) => {
    try {
      const segment = resolveSettingsSegment(c);
      const settings = await getPlatformSettingsCached(segment);
      return c.json(buildPlatformStatusPayload(segment, settings));
    } catch (e: any) {
      console.log(`platform-status GET error: ${e.message}`);
      return c.json({ maintenanceMode: false, maintenanceMessage: '', platformName: 'Roam Fleet' });
    }
  });

  // Public endpoint: GET /platform-feature-flags (no auth required)
  app.get("/make-server-37f42386/platform-feature-flags", async (c) => {
    try {
      const productLine = resolveProductLine(c);
      const settings = await getPlatformSettingsCached(productLine);
      const defaultModules = {
        fuelManagement: true,
        tollManagement: true,
        driverPortal: true,
        fleetEquipment: true,
        claimableLoss: true,
        performanceAnalytics: true,
      };
      return c.json({
        enabledModules: { ...defaultModules, ...(settings.enabledModules || {}) },
      });
    } catch (e: any) {
      console.log(`platform-feature-flags GET error: ${e.message}`);
      return c.json({ enabledModules: { fuelManagement: true, tollManagement: true, driverPortal: true, fleetEquipment: true, claimableLoss: true, performanceAnalytics: true } });
    }
  });

}
