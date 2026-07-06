/**
 * Passenger admin — platform trip/payment ledger (rides.ledger_lines SSOT).
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import { listDriverRideRequests } from "../../_shared/driverRideQueries.ts";
import {
  aggregateLedgerLinesForTrips,
  listPlatformLedgerLines,
} from "../../_shared/platformLedgerQueries.ts";
import { getDriverWallets } from "../../_shared/paymentAccounts.ts";
import { isCashSettlementV2Enabled } from "../cashSettlement/flags.ts";
import { isLedgerReadUnifiedEnabled } from "../../_shared/unifiedLedger/flags.ts";
import { listUnifiedLedgerEntries } from "../../_shared/unifiedLedger/queries.ts";

function ridesSvc() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "rides" } },
  );
}

export function registerPlatformLedgerAdminRoutes(admin: Hono) {
  admin.get("/ledger/trips", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25)));
    const riderUserId = c.req.query("rider_user_id")?.trim() || undefined;
    const driverUserId = c.req.query("driver_user_id")?.trim() || undefined;
    const status = c.req.query("status")?.trim() || undefined;
    const payment_method = c.req.query("payment_method")?.trim() as "cash" | "card" | undefined;
    const line_kind = c.req.query("line_kind")?.trim() || undefined;
    const from = c.req.query("from")?.trim() || undefined;
    const to = c.req.query("to")?.trim() || undefined;
    const grain = c.req.query("grain")?.trim() === "line" ? "line" as const : "trip" as const;

    if (isLedgerReadUnifiedEnabled() && grain === "line") {
      const { entries, total } = await listUnifiedLedgerEntries({
        product: "rides",
        from,
        to,
        limit,
        offset: (page - 1) * limit,
      });
      return c.json({
        lines: entries,
        total,
        page,
        limit,
        source: "ledger.entries",
      });
    }

    const db = ridesSvc();
    const pub = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (grain === "line") {
      const lineResult = await listPlatformLedgerLines(db, {
        riderUserId,
        driverUserId,
        page,
        limit,
        from,
        to,
        lineKind: line_kind,
      });
      if ("error" in lineResult) {
        return c.json({ error: "list_failed", message: lineResult.error }, 500);
      }
      return c.json(lineResult);
    }

    const result = await listDriverRideRequests(db, pub, {
      riderUserId,
      driverUserId,
      page,
      limit,
      status,
      payment_method: payment_method === "cash" || payment_method === "card" ? payment_method : undefined,
      lineKind: line_kind,
      from,
      to,
      dateField: "completed_at",
    });

    if ("error" in result) {
      return c.json({ error: "list_failed", message: result.error }, 500);
    }

    const rideIds = result.trips.map((t) => String(t.id));
    const linesByRide = await aggregateLedgerLinesForTrips(db, rideIds);
    const trips = result.trips.map((t) => ({
      ...t,
      ledger_lines: linesByRide[String(t.id)] ?? [],
      ledger_line_count: (linesByRide[String(t.id)] ?? []).length,
    }));

    return c.json({ trips, total: result.total, page: result.page, limit: result.limit });
  });

  admin.get("/ledger/wallet-reconciliation", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    if (!isCashSettlementV2Enabled()) {
      return c.json({ error: "feature_disabled", message: "Requires CASH_SETTLEMENT_V2=1" }, 404);
    }

    const currency = c.req.query("currency")?.trim() || "JMD";
    const format = c.req.query("format")?.trim() || "json";
    const db = ridesSvc();
    const pub = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: obligationRows, error } = await pub
      .from("rides_payment_obligations")
      .select("driver_user_id, remaining_minor, status, currency")
      .eq("currency", currency)
      .in("status", ["open", "partial"]);

    if (error) {
      return c.json({ error: "list_failed", message: error.message }, 500);
    }

    const byDriver = new Map<string, number>();
    for (const row of obligationRows ?? []) {
      const id = String(row.driver_user_id);
      byDriver.set(id, (byDriver.get(id) ?? 0) + Math.max(0, Number(row.remaining_minor ?? 0)));
    }

    const driverIds = [...byDriver.keys()];
    const rows: Array<Record<string, unknown>> = [];
    for (const driverUserId of driverIds) {
      const wallets = await getDriverWallets(db, driverUserId, currency);
      const openDebt = byDriver.get(driverUserId) ?? 0;
      rows.push({
        driver_user_id: driverUserId,
        currency,
        cash_balance_minor: wallets.cash.balance_minor,
        digital_available_minor: wallets.digital.available_minor,
        debt_balance_minor: wallets.debt.balance_minor,
        open_obligations_minor: openDebt,
      });
    }

    if (format === "csv") {
      const header = "driver_user_id,currency,cash_balance_minor,digital_available_minor,debt_balance_minor,open_obligations_minor";
      const lines = rows.map((r) =>
        [
          r.driver_user_id,
          r.currency,
          r.cash_balance_minor,
          r.digital_available_minor,
          r.debt_balance_minor,
          r.open_obligations_minor,
        ].join(",")
      );
      return new Response([header, ...lines].join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="wallet-reconciliation.csv"',
        },
      });
    }

    return c.json({ rows, currency, generated_at: new Date().toISOString() });
  });
}
