/**
 * Unified ledger admin routes — Dominion feed + reconciliation (Phases 14–15).
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import { isLedgerReadUnifiedEnabled } from "../../_shared/unifiedLedger/flags.ts";
import { 
  listUnifiedLedgerEntries, 
  reconcileLedgerIslands,
  reconcileAmountsBySource,
  checkProductBalances,
} from "../../_shared/unifiedLedger/queries.ts";

export function registerUnifiedLedgerAdminRoutes(admin: Hono) {
  admin.get("/ledger/unified/feed", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    if (!isLedgerReadUnifiedEnabled()) {
      return c.json({ error: "feature_disabled", message: "Set LEDGER_READ_UNIFIED=1" }, 403);
    }

    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));
    const product = c.req.query("product")?.trim() || undefined;
    const from = c.req.query("from")?.trim() || undefined;
    const to = c.req.query("to")?.trim() || undefined;
    const organizationId = c.req.query("organization_id")?.trim() || undefined;
    const driverId = c.req.query("driver_id")?.trim() || undefined;

    const { entries, total } = await listUnifiedLedgerEntries({
      organizationId,
      product,
      driverId,
      from,
      to,
      limit,
      offset: (page - 1) * limit,
    });

    return c.json({ entries, total, page, limit, source: "ledger.entries" });
  });

  admin.get("/ledger/unified/reconciliation", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const islands = await reconcileLedgerIslands();
    const anomalies = islands.filter((row) => row.delta !== 0);
    return c.json({
      islands,
      anomaly_count: anomalies.length,
      healthy: anomalies.length === 0,
    });
  });

  // Deep reconciliation: amount totals per source system
  admin.get("/ledger/unified/reconciliation/amounts", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    if (!isLedgerReadUnifiedEnabled()) {
      return c.json({ error: "feature_disabled", message: "Set LEDGER_READ_UNIFIED=1" }, 403);
    }

    const amounts = await reconcileAmountsBySource();
    return c.json({ amounts });
  });

  // Deep reconciliation: balance check per product
  admin.get("/ledger/unified/reconciliation/balances", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    if (!isLedgerReadUnifiedEnabled()) {
      return c.json({ error: "feature_disabled", message: "Set LEDGER_READ_UNIFIED=1" }, 403);
    }

    const balances = await checkProductBalances();
    const unbalanced = balances.filter((b) => !b.balanced);
    return c.json({ 
      balances,
      all_balanced: unbalanced.length === 0,
    });
  });
}
