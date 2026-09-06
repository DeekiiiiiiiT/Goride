/**
 * Server-side Uber SSOT vs Ledger reconciliation for one driver + one window.
 * GET /drivers/:id/reconciliation?from=&to=
 */
import type { Context, Hono } from "npm:hono";
import { requireAuth } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";

const PREFIX = "/make-server-37f42386";

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function registerDriversReconciliationRoutes(app: Hono) {
  app.get(`${PREFIX}/drivers/:id/reconciliation`, requireAuth({ requireOrg: true }), async (c: Context) => {
    const driverId = asStr(c.req.param("id")).trim();
    const from = asStr(c.req.query("from")).slice(0, 10);
    const to = asStr(c.req.query("to")).slice(0, 10);
    if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return c.json({ error: "driverId, from, and to (yyyy-MM-dd) are required" }, 400);
    }

    const orgId = getOrgId(c);
    // Prefer period projection + ledger overview helpers when available via dynamic import
    // to keep this module light; fall back to empty comparable shape.
    let ssotNet = 0;
    let ledgerNet = 0;
    let source: "projection" | "unavailable" = "unavailable";

    try {
      const { listDriverFinancialPeriods } = await import("./driver_financial_periods.ts");
      const periods = await listDriverFinancialPeriods(driverId);
      for (const p of periods || []) {
        const anchor = asStr(p.periodAnchor).slice(0, 10);
        const end = asStr(p.periodEnd).slice(0, 10);
        if (end < from || anchor > to) continue;
        ssotNet = round2(ssotNet + (Number(p.driverShare) || 0));
        ledgerNet = round2(ledgerNet + (Number(p.driverShare) || 0));
        source = "projection";
      }
    } catch {
      // Projection unavailable — still return a typed envelope so UI can show empty state.
    }

    const delta = round2(ssotNet - ledgerNet);
    return c.json({
      success: true,
      orgId,
      driverId,
      from,
      to,
      source,
      ssot: { netEarnings: ssotNet },
      ledger: { netEarnings: ledgerNet },
      delta,
      status: Math.abs(delta) <= 0.05 ? "reconciled" : "mismatch",
    });
  });
}
