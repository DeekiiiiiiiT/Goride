/**
 * Nightly finance recon: period projection vs formula identity checks.
 * POST with X-Fleet-Cron-Secret.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";
import { checkPeriodInvariants } from "../../../packages/finance-core/src/periodInvariants.ts";
import { checkPeriodVsLedgerEvents } from "../../../packages/finance-core/src/periodLedgerRecon.ts";
import {
  checkCloseInvariants,
  type ClosePeriodRow,
} from "../../../packages/finance-core/src/closeInvariants.ts";

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

type DriftRow = {
  runId: string;
  driverId?: string;
  week?: string;
  kind: string;
  field?: string;
  persisted: number;
  expected: number;
  severity?: "warning" | "critical";
};

async function postReconWebhook(
  runId: string,
  drifts: DriftRow[],
  summary: string,
): Promise<void> {
  const webhook = Deno.env.get("FINANCE_RECON_WEBHOOK_URL");
  if (!webhook) return;

  const payload = {
    text: summary,
    runId,
    driftCount: drifts.length,
    drifts: drifts.slice(0, 10).map((d) => ({
      kind: d.kind,
      driverId: d.driverId,
      week: d.week,
      field: d.field ?? d.kind,
      persisted: d.persisted,
      expected: d.expected,
    })),
    runbook: "docs/runbooks/settlement-ops.md#incident-decision-tree",
  };

  if (Deno.env.get("FINANCE_RECON_WEBHOOK_DRY_RUN") === "true") {
    console.log("[finance-recon] webhook dry-run:", JSON.stringify(payload));
    return;
  }

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (whErr) {
    console.error("[finance-recon] webhook failed:", whErr);
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

  const runId = crypto.randomUUID();

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
        "driver_id, period_anchor, cash_collected, cash_returned, cash_written_off, cash_still_held, settlement_amount, settlement_paid, organization_id, payout_net, driver_share, fleet_share, fuel_deduction, fuel_fleet_share, fuel_driver_spend, fuel_gas_card_spend, toll_cash_spend, toll_tag_spend, toll_spend, toll_charged_to_driver, toll_reimbursed, earnings_gross, tips_paid_to_driver, settlement_amount_minor, payout_net_minor, cash_still_held_minor, metadata",
      )
      .gte("period_anchor", fromYmd)
      .order("period_anchor", { ascending: true });
    if (error) throw error;

    const rows = periods || [];

    const { data: eventRows, error: evErr } = await supabase
      .from("financial_events")
      .select(
        "id, driver_id, period_anchor, event_type, amount_minor, reverses_event_id, reversed_at, debit_account_key, credit_account_key",
      )
      .gte("period_anchor", fromYmd)
      .lte("period_anchor", toYmd);
    if (evErr) throw evErr;

    const eventsByPeriod = new Map<string, Array<{ event_type: string; amount_minor: number }>>();
    const activeFuelEventsByPeriod = new Map<
      string,
      Array<{
        event_type: string;
        amount_minor: number;
        debit_account_key: string | null;
        credit_account_key: string | null;
      }>
    >();
    const reversedIds = new Set<string>();
    for (const ev of eventRows || []) {
      if (ev?.reverses_event_id) reversedIds.add(String(ev.reverses_event_id));
    }
    for (const ev of eventRows || []) {
      if (!ev?.driver_id || !ev?.period_anchor) continue;
      if (ev.reverses_event_id || ev.reversed_at) continue;
      if (reversedIds.has(String(ev.id))) continue;
      const key = `${ev.driver_id}|${String(ev.period_anchor).slice(0, 10)}`;
      const list = eventsByPeriod.get(key) || [];
      list.push({
        event_type: String(ev.event_type || ""),
        amount_minor: Number(ev.amount_minor) || 0,
      });
      eventsByPeriod.set(key, list);
      const et = String(ev.event_type || "");
      if (et.startsWith("fuel_")) {
        const fuelList = activeFuelEventsByPeriod.get(key) || [];
        fuelList.push({
          event_type: et,
          amount_minor: Number(ev.amount_minor) || 0,
          debit_account_key: ev.debit_account_key != null ? String(ev.debit_account_key) : null,
          credit_account_key: ev.credit_account_key != null ? String(ev.credit_account_key) : null,
        });
        activeFuelEventsByPeriod.set(key, fuelList);
      }
    }

    const drifts: DriftRow[] = [];
    let nullOrg = 0;
    for (const p of rows) {
      if (!p.organization_id) nullOrg++;
      for (const d of checkPeriodInvariants(p)) {
        drifts.push({
          runId,
          driverId: d.driverId ?? String(p.driver_id),
          week: d.week ?? String(p.period_anchor).slice(0, 10),
          kind: d.kind,
          field: d.kind,
          persisted: d.persisted,
          expected: d.expected,
          severity: d.kind.includes("minor") ? "critical" : "warning",
        });
      }
      const evKey = `${p.driver_id}|${String(p.period_anchor).slice(0, 10)}`;
      for (const d of checkPeriodVsLedgerEvents(p, eventsByPeriod.get(evKey) || [])) {
        drifts.push({
          runId,
          driverId: d.driverId ?? String(p.driver_id),
          week: d.week ?? String(p.period_anchor).slice(0, 10),
          kind: d.kind,
          field: d.kind,
          persisted: d.persisted,
          expected: d.expected,
          severity: "warning",
        });
      }

      // H-7: nightly close-invariant safety net (close remains the enforcement point).
      try {
        const week = String(p.period_anchor).slice(0, 10);
        const orgId = p.organization_id ? String(p.organization_id) : null;
        if (orgId) {
          const { data: stmts } = await supabase
            .from("week_statements")
            .select("kind, status, amounts_minor, version")
            .eq("organization_id", orgId)
            .eq("driver_id", p.driver_id)
            .eq("week_key", week)
            .in("status", ["closed", "draft"])
            .order("version", { ascending: false });
          const byKind = new Map<string, { amounts_minor?: Record<string, number>; status?: string }>();
          for (const s of stmts || []) {
            const k = String(s.kind);
            if (!byKind.has(k)) byKind.set(k, s as { amounts_minor?: Record<string, number>; status?: string });
          }
          const fuel = byKind.get("fuel");
          const toll = byKind.get("toll");
          const earnings = byKind.get("earnings");
          if (!fuel || !toll || !earnings) {
            drifts.push({
              runId,
              driverId: String(p.driver_id),
              week,
              kind: "CLOSE_STATEMENT_MISSING",
              field: "week_statements",
              persisted: [fuel, toll, earnings].filter(Boolean).length,
              expected: 3,
              severity: "warning",
            });
          } else {
            const fuelAmt = fuel.amounts_minor || {};
            const tollAmt = toll.amounts_minor || {};
            const earnAmt = earnings.amounts_minor || {};
            for (const b of checkCloseInvariants({
              period: p as ClosePeriodRow,
              fuelStatement: {
                driverShare: (Number(fuelAmt.driverShare) || 0) / 100,
                companyShare: (Number(fuelAmt.companyShare) || 0) / 100,
                status: String((fuel as { status?: string }).status || 'closed') as
                  | 'draft'
                  | 'closed'
                  | 'restated',
              },
              tollStatement: {
                totalSpend: (Number(tollAmt.totalSpend) || 0) / 100,
                chargedToDriver: (Number(tollAmt.chargedToDriver) || 0) / 100,
                reimbursed: (Number(tollAmt.reimbursed) || 0) / 100,
                netLoss: (Number(tollAmt.netLoss) || 0) / 100,
                status: String((toll as { status?: string }).status || 'closed') as
                  | 'draft'
                  | 'closed'
                  | 'restated',
              },
              earningsStatement: {
                passengerCash: (Number(earnAmt.passengerCash) || 0) / 100,
                status: String((earnings as { status?: string }).status || 'closed') as
                  | 'draft'
                  | 'closed'
                  | 'restated',
              },
              cashSourceMismatch: Number(
                (p.metadata as { financeCore?: { cashSourceMismatch?: number } } | null)
                  ?.financeCore?.cashSourceMismatch,
              ) || 0,
            })) {
              drifts.push({
                runId,
                driverId: b.driverId ?? String(p.driver_id),
                week: b.week ?? week,
                kind: b.code,
                field: b.code,
                persisted: b.persisted,
                expected: b.expected,
                severity: b.severity === "block" ? "critical" : "warning",
              });
            }
          }

          // M-2: active fuel_* events must carry debit/credit account keys (trial-balance hygiene).
          const fuelEv = activeFuelEventsByPeriod.get(`${p.driver_id}|${week}`) || [];
          const missingAccounts = fuelEv.filter(
            (ev) => !ev.debit_account_key || !ev.credit_account_key,
          );
          if (missingAccounts.length > 0) {
            drifts.push({
              runId,
              driverId: String(p.driver_id),
              week,
              kind: "FUEL_EVENT_MISSING_ACCOUNTS",
              field: "debit_account_key|credit_account_key",
              persisted: missingAccounts.length,
              expected: 0,
              severity: "critical",
            });
          } else if (fuelEv.length > 0) {
            // Trial balance: each keyed event posts +amt debit / −amt credit → Σ accounts = 0.
            const byAcct = new Map<string, number>();
            for (const ev of fuelEv) {
              const amt = Number(ev.amount_minor) || 0;
              const d = String(ev.debit_account_key);
              const c = String(ev.credit_account_key);
              byAcct.set(d, (byAcct.get(d) || 0) + amt);
              byAcct.set(c, (byAcct.get(c) || 0) - amt);
            }
            let accountSum = 0;
            for (const v of byAcct.values()) accountSum += v;
            if (Math.abs(accountSum) > 0) {
              drifts.push({
                runId,
                driverId: String(p.driver_id),
                week,
                kind: "STATEMENT_ACCOUNTS_UNBALANCED",
                field: "fuel_event_accounts",
                persisted: accountSum / 100,
                expected: 0,
                severity: "critical",
              });
            }
          }
        }
      } catch (closeErr) {
        console.warn("[finance-recon] H-7 close invariants skipped:", errMsg(closeErr));
      }
    }

    const ok = drifts.length === 0;
    if (!ok) {
      const summary = `[finance-recon] runId=${runId} ${drifts.length} drift(s), nullOrg=${nullOrg}`;
      console.error(summary, drifts.slice(0, 5));
      await postReconWebhook(runId, drifts, summary);
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
        runId,
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
    return new Response(JSON.stringify({ error: msg, runId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
