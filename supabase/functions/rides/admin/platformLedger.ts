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
}
