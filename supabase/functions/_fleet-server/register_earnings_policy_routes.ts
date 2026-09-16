/**
 * Peeled from index.tsx — Wave F0. Behavior unchanged.
 */
import type { Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import { requireAuth } from "./rbac_middleware.ts";
import { stampOrg, filterByOrg } from "./org_scope.ts";
import {
  validateEarningsPolicyPayload,
  normalizeEarningsPolicyForPersist,
} from "./earnings_policy_validation.ts";

export function registerEarningsPolicyRoutes(app: Hono) {
  // --- EARNINGS POLICIES ---
  // Bundled tiers + quotas + personalAllowance with version scheduling.
  // Empty by default — does NOT auto-seed Default on GET.
  // Runtime consumers fall back to legacy prefs when policies empty.

  app.get("/make-server-37f42386/earnings-policies", requireAuth(), async (c) => {
    try {
      const items = await kv.getByPrefix("earnings_policy:");
      // NO auto-seed — return empty array when library is empty
      return c.json(filterByOrg(items || [], c));
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  app.post("/make-server-37f42386/earnings-policies", async (c) => {
    try {
      const raw = await c.req.json();
      const validationError = validateEarningsPolicyPayload(raw);
      if (validationError) return c.json({ error: validationError }, 400);

      // Persist migrated assignments shape (legacy driverIds windows → assignments)
      const item = normalizeEarningsPolicyForPersist(raw);
      if (!item.id) item.id = crypto.randomUUID();

      // Enforce single default — clear isDefault from other policies
      if (item.isDefault) {
        const existing = (await kv.getByPrefix("earnings_policy:")) || [];
        for (const other of existing) {
          if (other?.id && other.id !== item.id && other.isDefault) {
            await kv.set(`earnings_policy:${other.id}`, { ...other, isDefault: false });
          }
        }
      }

      await kv.set(`earnings_policy:${item.id}`, stampOrg(item, c));
      return c.json({ success: true, data: item });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

  app.delete("/make-server-37f42386/earnings-policies/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const existing = (await kv.getByPrefix("earnings_policy:")) || [];
      const target = existing.find((p: any) => p?.id === id);
      if (!target) return c.json({ success: true });

      // Block deleting last policy
      if (existing.length <= 1) {
        return c.json({ error: "Cannot delete the last remaining earnings policy." }, 409);
      }
      // Block deleting default
      if (target.isDefault) {
        return c.json({ error: "Cannot delete the default policy. Set another policy as default first." }, 409);
      }

      await kv.del(`earnings_policy:${id}`);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ error: e.message }, 500); }
  });

}
