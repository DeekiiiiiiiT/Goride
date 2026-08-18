/**
 * Nightly finance recon: period projection vs posting identity checks.
 * POST with X-Fleet-Cron-Secret.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-fleet-cron-secret, x-rides-cron-secret",
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const denied = requireInternalSecret(req, {
    envKeys: ["FLEET_CRON_SECRET", "RIDES_CRON_SECRET"],
    headerNames: ["X-Fleet-Cron-Secret", "X-Rides-Cron-Secret"],
  });
  if (denied) {
    const body = await denied.text();
    return new Response(body, {
      status: denied.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const weekFrom = new Date();
  weekFrom.setUTCDate(weekFrom.getUTCDate() - 56);
  const fromYmd = weekFrom.toISOString().slice(0, 10);
  const toYmd = new Date().toISOString().slice(0, 10);

  try {
    const { data: periods, error } = await supabase
      .schema("ledger")
      .from("driver_financial_periods")
      .select(
        "driver_id, period_anchor, cash_collected, cash_returned, cash_written_off, cash_still_held, settlement_amount, organization_id, payout_net, driver_share, fuel_deduction",
      )
      .gte("period_anchor", fromYmd)
      .order("period_anchor", { ascending: true });
    if (error) throw error;

    const rows = periods || [];
    const drifts: Array<Record<string, unknown>> = [];
    let nullOrg = 0;
    for (const p of rows) {
      if (!p.organization_id) nullOrg++;
      const held = round2(Number(p.cash_still_held) || 0);
      const expectedHeld = round2(
        (Number(p.cash_collected) || 0) -
          (Number(p.cash_returned) || 0) -
          (Number(p.cash_written_off) || 0),
      );
      if (Math.abs(held - expectedHeld) > 0.01) {
        drifts.push({
          driverId: p.driver_id,
          week: p.period_anchor,
          kind: "cash_still_held",
          held,
          expectedHeld,
        });
      }
    }

    const ok = drifts.length === 0;
    if (!ok) {
      console.warn(`[finance-recon] ${drifts.length} drift(s), nullOrg=${nullOrg}`);
    }

    await supabase.schema("ledger").from("finance_recon_runs").insert({
      week_from: fromYmd,
      week_to: toYmd,
      period_count: rows.length,
      drift_count: drifts.length,
      null_org_count: nullOrg,
      ok,
      details: drifts.slice(0, 100),
    });

    return new Response(
      JSON.stringify({
        success: true,
        ok,
        periodCount: rows.length,
        driftCount: drifts.length,
        nullOrgCount: nullOrg,
        sample: drifts.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
