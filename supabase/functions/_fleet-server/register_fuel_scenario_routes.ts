/**
 * Peeled from index.tsx — Wave F0. Behavior unchanged.
 */
import type { Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import { requireAuth } from "./rbac_middleware.ts";
import { stampOrg, filterByOrg } from "./org_scope.ts";
import { validateFuelScenarioPayload } from "./fuel_scenario_validation.ts";

export function registerFuelScenarioRoutes(app: Hono) {
  // --- FUEL SCENARIOS ---
  // validateFuelScenarioPayload lives in ./fuel_scenario_validation.ts (a
  // dependency-free module) so it's directly unit-testable with Vitest — this
  // file itself is Deno-only and excluded from the Vitest run.

  app.get("/make-server-37f42386/scenarios", requireAuth(), async (c) => {
    try {
      const items = await kv.getByPrefix("fuel_scenario:");

      // Auto-Seed if empty (Phase 10 Requirement)
      if (!items || items.length === 0) {
          const defaultId = crypto.randomUUID();
          const defaultScenario = {
              id: defaultId,
              name: "Standard Fleet Rule",
              description: "Default granular coverage settings.",
              isDefault: true,
              rules: [{
                  id: crypto.randomUUID(),
                  category: "Fuel",
                  coverageType: "Percentage",
                  coverageValue: 50, // Fallback
                  rideShareCoverage: 100,
                  companyUsageCoverage: 100,
                  deadheadCoverage: 50,
                  personalCoverage: 0,
                  miscCoverage: 50,
                  conditions: { requiresReceipt: true }
              }]
          };
          await kv.set(`fuel_scenario:${defaultId}`, stampOrg(defaultScenario, c));
          return c.json([defaultScenario]);
      }

      return c.json(filterByOrg(items || [], c));
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  app.post("/make-server-37f42386/scenarios", async (c) => {
    try {
      const item = await c.req.json();
      const validationError = validateFuelScenarioPayload(item);
      if (validationError) return c.json({ error: validationError }, 400);

      if (!item.id) item.id = crypto.randomUUID();

      // Guarantee at most one default scenario — previously nothing enforced
      // this, so multiple scenarios could end up isDefault:true simultaneously
      // and `.find(s => s.isDefault)` (used throughout the reconciliation math)
      // would pick an arbitrary one.
      if (item.isDefault) {
        const existing = (await kv.getByPrefix("fuel_scenario:")) || [];
        for (const other of existing) {
          if (other?.id && other.id !== item.id && other.isDefault) {
            await kv.set(`fuel_scenario:${other.id}`, { ...other, isDefault: false });
          }
        }
      }

      await kv.set(`fuel_scenario:${item.id}`, stampOrg(item, c));
      return c.json({ success: true, data: item });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  app.delete("/make-server-37f42386/scenarios/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const existing = (await kv.getByPrefix("fuel_scenario:")) || [];
      const target = existing.find((s: any) => s?.id === id);
      if (!target) return c.json({ success: true });

      // Guard against dropping every vehicle into the hardcoded last-resort
      // fallback in fuelCalculationService.ts (100% company for trips/ops, 100%
      // driver for personal, no admin-facing warning) by deleting the last
      // scenario, or the current default with nothing left to promote.
      if (existing.length <= 1) {
        return c.json({ error: "Cannot delete the last remaining fuel scenario." }, 409);
      }
      if (target.isDefault) {
        return c.json({ error: "Cannot delete the default scenario. Set another scenario as default first." }, 409);
      }

      await kv.del(`fuel_scenario:${id}`);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

}
