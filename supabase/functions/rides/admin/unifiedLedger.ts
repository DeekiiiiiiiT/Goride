/**
 * Unified ledger admin routes — Dominion feed + reconciliation + soak (Phases 14–16).
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import {
  isLedgerPhaseDReconMode,
  isLedgerReadUnifiedEnabled,
  ledgerRetiredIslands,
} from "../../_shared/unifiedLedger/flags.ts";
import {
  listUnifiedLedgerEntries,
  reconcileLedgerIslands,
  reconcileAmountsBySource,
  checkProductBalances,
} from "../../_shared/unifiedLedger/queries.ts";
import { unifiedLedgerClient } from "../../_shared/unifiedLedger/postEntry.ts";

const EXCLUDED_FROM_GREEN = new Set(["rides_ledger_lines"]);

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

    try {
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
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[unifiedLedger] feed:", message);
      return c.json({ error: "feed_failed", message }, 500);
    }
  });

  admin.get("/ledger/unified/reconciliation", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    try {
      const islands = await reconcileLedgerIslands();
      const retired = ledgerRetiredIslands();
      const phaseD = isLedgerPhaseDReconMode();
      const moneyAnomalies = islands.filter((row) => {
        if (EXCLUDED_FROM_GREEN.has(row.source_system)) return false;
        if (phaseD && retired.has(row.source_system)) return false;
        return row.delta !== 0;
      });
      return c.json({
        islands: islands.map((row) => ({
          ...row,
          status: EXCLUDED_FROM_GREEN.has(row.source_system)
            ? "expected"
            : retired.has(row.source_system)
            ? "retired"
            : row.delta === 0
            ? "green"
            : "drift",
        })),
        anomaly_count: moneyAnomalies.length,
        healthy: moneyAnomalies.length === 0,
        phase_d_recon: phaseD,
        excluded_from_green: [...EXCLUDED_FROM_GREEN],
        retired_islands: [...retired],
        green_definition:
          "Money islands at delta 0 (financial_event, kv_ledger_event, kv_toll_ledger, rides_payment_journal, dash_payments). Neutrals/zeros excluded. rides_ledger_lines informational. Phase 0: 48h unified_dual_write fail soak before Phase B shadow.",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[unifiedLedger] reconciliation:", message);
      return c.json({ error: "reconciliation_failed", message }, 500);
    }
  });

  /** Phase 0 soak go/no-go snapshot */
  admin.get("/ledger/unified/soak-status", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    try {
      const client = unifiedLedgerClient();
      const { data, error } = await client.rpc("ledger_soak_status");
      if (error) throw new Error(error.message);
      return c.json(data ?? {});
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Fallback if RPC not yet applied
      const islands = await reconcileLedgerIslands();
      const moneyBad = islands.filter(
        (i) => i.source_system !== "rides_ledger_lines" && i.delta !== 0,
      );
      return c.json({
        checked_at: new Date().toISOString(),
        money_islands_green: moneyBad.length === 0,
        money_anomaly_count: moneyBad.length,
        go_for_phase_b: moneyBad.length === 0,
        islands,
        fallback: true,
        message,
      });
    }
  });

  admin.get("/ledger/unified/reconciliation/amounts", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    if (!isLedgerReadUnifiedEnabled()) {
      return c.json({ error: "feature_disabled", message: "Set LEDGER_READ_UNIFIED=1" }, 403);
    }

    try {
      const amounts = await reconcileAmountsBySource();
      return c.json({ amounts });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[unifiedLedger] amounts:", message);
      return c.json({ error: "amounts_failed", message }, 500);
    }
  });

  admin.get("/ledger/unified/reconciliation/balances", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    if (!isLedgerReadUnifiedEnabled()) {
      return c.json({ error: "feature_disabled", message: "Set LEDGER_READ_UNIFIED=1" }, 403);
    }

    try {
      const balances = await checkProductBalances();
      const unbalanced = balances.filter((b) => !b.balanced);
      return c.json({
        balances,
        all_balanced: unbalanced.length === 0,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[unifiedLedger] balances:", message);
      return c.json({ error: "balances_failed", message }, 500);
    }
  });
}
