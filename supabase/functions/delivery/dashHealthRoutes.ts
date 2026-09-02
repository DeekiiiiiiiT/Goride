/**
 * Golden-path health probes for Dash monitoring (Phase 3).
 * Call from an ops cron or uptime checker; returns structured check results.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const STUCK_ORDER_MINUTES = Number(Deno.env.get("DASH_STUCK_ORDER_MINUTES") || 45);

export function registerDashHealthRoutes(
  app: Hono,
  deps: { getServiceSupabase: () => SupabaseClient },
) {
  app.get("/health/dash-golden-path", async (c) => {
    const cronSecret = c.req.header("x-fleet-cron-secret") || "";
    const expected = Deno.env.get("FLEET_CRON_SECRET") || "";
    const serviceKey = c.req.header("x-service-role") || "";
    const expectedService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authorized =
      (expected && cronSecret === expected) ||
      (expectedService && serviceKey === expectedService) ||
      c.req.query("public") === "1";
    if (!authorized) return c.json({ error: "Forbidden" }, 403);

    const sb = deps.getServiceSupabase();
    const cutoff = new Date(Date.now() - STUCK_ORDER_MINUTES * 60_000).toISOString();

    const { count: stuckCount } = await sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["placed", "accepted", "preparing", "ready", "assigned", "picked_up", "in_transit"])
      .lt("updated_at", cutoff);

    const { count: readyNoCourier } = await sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready")
      .is("courier_id", null)
      .lt("ready_at", cutoff);

    const { error: idempotencyTableError } = await sb
      .from("order_idempotency_keys")
      .select("id", { count: "exact", head: true })
      .limit(1);
    const idempotencyTableOk = !idempotencyTableError;

    const vapidOk = Boolean(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY"));
    const wipayOk = Boolean(
      Deno.env.get("WIPAY_ACCOUNT_NUMBER") && Deno.env.get("WIPAY_API_KEY"),
    );
    const smsOk = Boolean(
      (Deno.env.get("DIGICEL_SMS_API_URL") && Deno.env.get("DIGICEL_SMS_API_KEY")) ||
        (Deno.env.get("FLOW_SMS_API_URL") && Deno.env.get("FLOW_SMS_API_KEY")),
    );

    const alerts: string[] = [];
    if ((stuckCount ?? 0) > 0) alerts.push(`stuck_orders:${stuckCount}`);
    if ((readyNoCourier ?? 0) > 0) alerts.push(`ready_no_courier:${readyNoCourier}`);
    if (!vapidOk) alerts.push("vapid_missing");
    if (!smsOk) alerts.push("sms_carrier_missing");
    if (!idempotencyTableOk) alerts.push("order_idempotency_keys_missing");

    const ok = alerts.length === 0;
    return c.json({
      ok,
      alerts,
      checks: {
        stuckOrders: stuckCount ?? 0,
        readyWithoutCourier: readyNoCourier ?? 0,
        vapidConfigured: vapidOk,
        wipayConfigured: wipayOk,
        smsConfigured: smsOk,
        orderIdempotencyTable: idempotencyTableOk,
        stuckThresholdMinutes: STUCK_ORDER_MINUTES,
      },
    }, ok ? 200 : 503);
  });
}
