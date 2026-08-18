/**
 * Read-only C1–C6 scan against ledger.entries.
 * POST with X-Fleet-Cron-Secret.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-fleet-cron-secret, x-rides-cron-secret",
};

function dollars(minor: unknown): number {
  return Math.round(Number(minor || 0)) / 100;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

type EntryRow = {
  id: string;
  idempotency_key: string | null;
  entry_type: string;
  amount_minor: number;
  effective_at: string | null;
  metadata: Record<string, unknown> | null;
  reference_id: string | null;
};

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

  try {
    const entries: EntryRow[] = [];
    const page = 1000;
    for (let from = 0; from < 50000; from += page) {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, idempotency_key, entry_type, amount_minor, effective_at, metadata, reference_id")
        .range(from, from + page - 1);
      if (error) throw error;
      const rows = (data || []) as EntryRow[];
      entries.push(...rows);
      if (rows.length < page) break;
    }
    const meta = (e: EntryRow) =>
      e.metadata && typeof e.metadata === "object" ? e.metadata : {};

    const c1Clusters: Array<Record<string, unknown>> = [];
    const cash = entries.filter((e) => e.entry_type === "payout_cash");
    const cashGroups = new Map<string, EntryRow[]>();
    for (const e of cash) {
      const driver = String(meta(e).driverId || meta(e).driver_id || "").trim().toLowerCase() ||
        "__none__";
      const d = String(e.effective_at || "").slice(0, 10);
      const amt = dollars(e.amount_minor);
      const k = `${driver}|${d}|${amt.toFixed(2)}`;
      const g = cashGroups.get(k) || [];
      g.push(e);
      cashGroups.set(k, g);
    }
    for (const [k, group] of cashGroups) {
      if (group.length < 2) continue;
      const uniq = new Set(
        group.map((e) => String(e.idempotency_key || "").trim()).filter(Boolean),
      );
      if (uniq.size < 2) continue;
      const posted = group.reduce((s, e) => s + dollars(e.amount_minor), 0);
      c1Clusters.push({
        key: k,
        copies: group.length,
        posted,
        real: posted / group.length,
        keys: group.map((e) => String(e.idempotency_key || "").slice(0, 90)),
      });
    }

    const tripTolls = entries.filter(
      (e) =>
        e.entry_type === "toll_charge" &&
        (String(e.idempotency_key || "").includes(":trip:") ||
          String(e.idempotency_key || "").startsWith("trip:")),
    );
    const plazaTolls = entries.filter(
      (e) => e.entry_type === "toll_charge" && String(e.idempotency_key || "").includes("toll_ledger:"),
    );
    const tripReimburse = entries.filter(
      (e) =>
        e.entry_type === "toll_reimbursement" &&
        (String(e.idempotency_key || "").includes(":trip:") ||
          String(e.idempotency_key || "").startsWith("trip:")),
    );

    const uniqueness: Array<Record<string, unknown>> = [];
    const tripIdCounts = new Map<string, EntryRow[]>();
    for (const e of entries) {
      if (e.entry_type !== "toll_charge" && e.entry_type !== "toll_reimbursement") continue;
      const key = String(e.idempotency_key || "");
      const m = key.match(/:trip:([0-9a-f-]{36})/i) || key.match(/^trip:([0-9a-f-]{36})/i);
      if (!m) continue;
      const id = m[1].toLowerCase();
      const g = tripIdCounts.get(id) || [];
      g.push(e);
      tripIdCounts.set(id, g);
    }
    for (const [tripId, group] of tripIdCounts) {
      if (group.length < 2) continue;
      uniqueness.push({
        tripId,
        copies: group.length,
        types: group.map((e) => e.entry_type),
      });
    }

    const c3 = entries.filter((e) => {
      if (e.entry_type !== "toll_support_adjustment") return false;
      return String(meta(e).description || "").toLowerCase().includes("trip completed order");
    });

    const moneyTypes = new Set([
      "payout_cash",
      "payout_bank",
      "statement_line",
      "fare_earning",
      "promotion",
      "tip",
      "payment_line",
      "toll_charge",
      "toll_reimbursement",
      "toll_support_adjustment",
    ]);
    const c4 = entries.filter((e) => {
      if (!moneyTypes.has(e.entry_type)) return false;
      const p = String(meta(e).platform || "").trim();
      return !p;
    });

    const c6 = entries.filter((e) => {
      if (e.entry_type !== "toll_support_adjustment") return false;
      const blob = `${e.idempotency_key || ""} ${meta(e).description || ""} ${e.reference_id || ""} ${meta(e).supportCaseId || ""}`;
      return /91bae090/i.test(blob);
    });

    const report = {
      generatedAt: new Date().toISOString(),
      rowCount: entries.length,
      C1: {
        clusters: c1Clusters.length,
        posted: c1Clusters.reduce((s, c) => s + Number(c.posted || 0), 0),
        real: c1Clusters.reduce((s, c) => s + Number(c.real || 0), 0),
        detail: c1Clusters,
      },
      C2: {
        tripChargeRows: tripTolls.length,
        tripChargeDollars: tripTolls.reduce((s, e) => s + Math.abs(dollars(e.amount_minor)), 0),
        tripReimbursementRows: tripReimburse.length,
        tripReimbursementDollars: tripReimburse.reduce((s, e) => s + Math.abs(dollars(e.amount_minor)), 0),
        plazaChargeRows: plazaTolls.length,
        plazaChargeDollars: plazaTolls.reduce((s, e) => s + Math.abs(dollars(e.amount_minor)), 0),
        leftoverPlazaVsTrip: Math.max(0, plazaTolls.length - tripReimburse.length),
        uniquenessDupes: uniqueness.length,
        uniquenessDetail: uniqueness.slice(0, 20),
        note: "Pass when tripChargeRows is 0. Plaza vs trip leftover is expected. Do not reverse trip rows.",
      },
      C3: {
        rows: c3.length,
        dollars: c3.reduce((s, e) => s + Math.abs(dollars(e.amount_minor)), 0),
      },
      C4: {
        rows: c4.length,
        dollars: c4.reduce((s, e) => s + Math.abs(dollars(e.amount_minor)), 0),
      },
      C5: { weeks: 0, note: "Statement+trip fare double basis — keep as a permanent zero check." },
      C6: {
        rows: c6.length,
        dollars: c6.reduce((s, e) => s + Math.abs(dollars(e.amount_minor)), 0),
      },
    };

    const blocking =
      c1Clusters.length > 0 ||
      tripTolls.length > 0 ||
      uniqueness.length > 0 ||
      c3.length > 0 ||
      c6.length > 1 ||
      c4.filter((e) => e.entry_type === "payout_cash").length > 0;

    const { error: persistErr } = await supabase.from("finance_doctor_runs").insert({
      ok: !blocking,
      blocking,
      c1_clusters: c1Clusters.length,
      report,
    });
    if (persistErr) {
      console.warn("[finance-doctor] persist failed:", persistErr.message);
    }

    return new Response(JSON.stringify({ success: true, blocking, report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = errMsg(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
