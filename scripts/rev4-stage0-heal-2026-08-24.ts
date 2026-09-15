/**
 * Rev4 Stage 0 one-off: heal driver 73e5b1dc week 2026-08-24.
 * Authority = closed fuel week_statement (consumption_strip), not corrupt snap.
 * Run: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set; deno run -A scripts/rev4-stage0-heal-2026-08-24.ts
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  postFuelFinalizedEventsFromReport,
  reverseFuelFinancialEventsForWeek,
  listActiveFuelEventsForWeek,
} from "../supabase/functions/_fleet-server/fuel_financial_reset.ts";
import { sealFuelWeek } from "../supabase/functions/_fleet-server/fuel_week_seal.ts";

const ORG = "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823";
const WEEK = "2026-08-24";
const DRIVER = "73e5b1dc-01b4-45ee-a34a-25a3256b9841";
const KV_KEY = `finalized_report:${WEEK}:${DRIVER}`;
const PERIOD_ID = `${ORG}:${WEEK}`;

// Closed statement v13 (consumption_strip) — major units
const STMT = {
  driverShare: 5784.98,
  companyShare: 29211.62,
  totalSpend: 34996.6,
  miscellaneousCost: 3063.23,
};

function sb() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

async function main() {
  const client = sb();

  const { data: kvRow, error: kvErr } = await client
    .from("kv_store_37f42386")
    .select("value")
    .eq("key", KV_KEY)
    .maybeSingle();
  if (kvErr) throw new Error(kvErr.message);
  if (!kvRow?.value) throw new Error(`Missing KV ${KV_KEY}`);

  const snap = { ...(kvRow.value as Record<string, unknown>) };
  const before = {
    driverShare: Number(snap.driverShare) || 0,
    companyShare: Number(snap.companyShare) || 0,
  };

  // Patch snap money to sealed statement (C-2 heal). Keep spend fields already used by ledger.
  snap.driverShare = STMT.driverShare;
  snap.companyShare = STMT.companyShare;
  snap.miscellaneousCost = STMT.miscellaneousCost;
  snap.totalGasCardCost = STMT.totalSpend; // strip total spend convention
  snap.postedDriverShare = STMT.driverShare;
  snap.postedCompanyShare = STMT.companyShare;
  snap.metadata = {
    ...((snap.metadata as Record<string, unknown>) || {}),
    rev4Stage0Heal: {
      at: new Date().toISOString(),
      reason: "Rev4 Stage0 C-2 healing — align snap to fuel week_statement consumption_strip",
      prior: before,
      statement: STMT,
    },
  };

  const { error: upErr } = await client.from("kv_store_37f42386").upsert({
    key: KV_KEY,
    value: snap,
  });
  if (upErr) throw new Error(`KV upsert: ${upErr.message}`);

  // Explicit reverse then post (postFuel also reverses on mismatch).
  const rev = await reverseFuelFinancialEventsForWeek(DRIVER, WEEK, "rev4_stage0_c2_heal");
  console.log(JSON.stringify({ phase: "reverse", ...rev }));

  const posted = await postFuelFinalizedEventsFromReport(snap as Record<string, unknown>);
  console.log(
    JSON.stringify({
      phase: "post",
      weekKey: posted.weekKey,
      driverId: posted.driverId,
      results: posted.results.map((r) => ({ ok: r.ok, skipped: r.skipped, error: r.error })),
    }),
  );

  const sealed = await sealFuelWeek({
    organizationId: ORG,
    weekKey: WEEK,
    actorId: "rev4_stage0_heal",
    force: true,
    amountsByDriver: {
      [DRIVER]: {
        driverShare: STMT.driverShare,
        companyShare: STMT.companyShare,
        totalSpend: STMT.totalSpend,
        miscellaneousCost: STMT.miscellaneousCost,
      },
    },
  });
  console.log(JSON.stringify({ phase: "seal", ...sealed }));

  // Align period strip to healed statement (single-driver week).
  await client
    .from("fuel_reconciliation_period")
    .update({
      driver_share: STMT.driverShare,
      company_share: STMT.companyShare,
      total_spend: STMT.totalSpend,
      unexplained: STMT.miscellaneousCost,
      reopen_reason: "Rev4 Stage0 C-2 healing (surgical reseal; period stayed locked)",
      updated_at: new Date().toISOString(),
    })
    .eq("id", PERIOD_ID);

  const active = await listActiveFuelEventsForWeek(DRIVER, WEEK);
  let ledgerDriver = 0;
  let ledgerCompany = 0;
  for (const ev of active) {
    const et = String(ev.event_type || "");
    const amt = Math.abs(Number(ev.amount_minor) || 0);
    if (et === "fuel_deduction") ledgerDriver += amt;
    else if (et === "fuel_fleet_share") ledgerCompany += amt;
  }

  const { data: stmt } = await client
    .from("week_statements")
    .select("version, status, amounts_minor, close_reason")
    .eq("organization_id", ORG)
    .eq("driver_id", DRIVER)
    .eq("week_key", WEEK)
    .eq("kind", "fuel")
    .eq("status", "closed")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const stmtAmt = (stmt?.amounts_minor || {}) as Record<string, number>;
  const stmtDriver = Math.round(Number(stmtAmt.driverShare) || 0);
  const stmtCompany = Math.round(Number(stmtAmt.companyShare) || 0);

  // Period stays locked — record heal audit (no full-week reopen wipe).
  await client.from("fuel_period_audit").insert({
    org_id: ORG,
    period_id: PERIOD_ID,
    action: "reopen_reseal_stage0",
    actor_id: "rev4_stage0_heal",
    payload: {
      reason: "Rev4 Stage0 C-2 healing",
      driverId: DRIVER,
      weekStart: WEEK,
      priorSnap: before,
      statement: STMT,
      ledgerAfter: { driverShareMinor: ledgerDriver, companyShareMinor: ledgerCompany },
      note: "Surgical reverse+repost+reseal; full period reopen skipped (would wipe all week snaps)",
    },
  });

  const deltaDriver = stmtDriver - ledgerDriver;
  const deltaCompany = stmtCompany - ledgerCompany;
  console.log(
    JSON.stringify({
      phase: "verify",
      stmtVersion: stmt?.version,
      stmtDriver,
      stmtCompany,
      ledgerDriver,
      ledgerCompany,
      deltaDriver,
      deltaCompany,
      ok: Math.abs(deltaDriver) <= 1 && Math.abs(deltaCompany) <= 1,
    }),
  );

  if (Math.abs(deltaDriver) > 1 || Math.abs(deltaCompany) > 1) {
    Deno.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});
