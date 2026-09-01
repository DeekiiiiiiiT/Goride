/**
 * Nightly finance recon: period projection vs formula identity checks.
 * POST with X-Fleet-Cron-Secret.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";
import { checkPeriodInvariants } from "../../packages/finance-core/src/periodInvariants.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-fleet-cron-secret, x-rides-cron-secret",
};

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
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
      .from("driver_financial_periods")
      .select(
        "driver_id, period_anchor, cash_collected, cash_returned, cash_written_off, cash_still_held, settlement_amount, settlement_paid, organization_id, payout_net, driver_share, fleet_share, fuel_deduction, fuel_fleet_share, toll_cash_spend, toll_tag_spend, toll_spend, toll_charged_to_driver, earnings_gross, tips_paid_to_driver, metadata",
      )
      .gte("period_anchor", fromYmd)
      .order("period_anchor", { ascending: true });
    if (error) throw error;

    const rows = periods || [];
    const drifts: Array<Record<string, unknown>> = [];
    let nullOrg = 0;
    for (const p of rows) {
      if (!p.organization_id) nullOrg++;
      for (const d of checkPeriodInvariants(p)) {
        drifts.push({
          driverId: d.driverId ?? p.driver_id,
          week: d.week ?? p.period_anchor,
          kind: d.kind,
          persisted: d.persisted,
          expected: d.expected,
        });
      }
    }

    const ok = drifts.length === 0;
    if (!ok) {
      const summary = `[finance-recon] ${drifts.length} drift(s), nullOrg=${nullOrg}`;
      console.error(summary, drifts.slice(0, 5));
    }

    const { error: persistErr } = await supabase.from("finance_recon_runs").insert({
      week_from: fromYmd,
      week_to: toYmd,
      period_count: rows.length,
      drift_count: drifts.length,
      null_org_count: nullOrg,
      ok,
      details: drifts.slice(0, 100),
    });
    if (persistErr) throw persistErr;

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
    const msg = errMsg(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
