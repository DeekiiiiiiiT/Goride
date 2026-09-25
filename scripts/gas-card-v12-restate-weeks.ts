/**
 * V12 week restate: calendar reopen → rebuild finalized_report without JAA statement
 * rows → rewrite fuel_reconciliation_period money → seal → re-close DFP.
 *
 * Does NOT surgically patch wallet (already net-correct from Rev7). Rebuilds the
 * frozen record so recompute stops re-inflating from statement rows in the snap.
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno run -A scripts/gas-card-v12-restate-weeks.ts
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { reopenWeek } from "../supabase/functions/_fleet-server/week_close.ts";
import { sealFuelWeek } from "../supabase/functions/_fleet-server/fuel_week_seal.ts";

const ORG = "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823";
const DRIVER = "73e5b1dc-01b4-45ee-a34a-25a3256b9841";
const ACTOR = "cursor-agent-v12-restate";

/** Known driver_share overstatements from audit Rev 8 (statement-sourced). */
const WEEKS: Array<{
  week: string;
  driverOverstatement: number;
  /** Approved statement amounts that inflated total spend (not fee/declined). */
  statementSpendRemoved: number;
}> = [
  { week: "2026-08-03", driverOverstatement: 749.6375562442336, statementSpendRemoved: 4500 },
  {
    week: "2026-08-10",
    driverOverstatement: 1746.9357412637305 + 1735.0294133001132 + 852.5162012784127,
    statementSpendRemoved: 0, // filled from snap settledEntries classification
  },
  {
    week: "2026-08-17",
    driverOverstatement: 1600.2324091286962 * 3,
    statementSpendRemoved: 0,
  },
];

function sb() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

function isStatementEntry(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  const meta = (payload.metadata || {}) as Record<string, unknown>;
  const importSource = String(meta.importSource || "");
  if (["jaa_raw", "jaa_statement_details", "fuel_statement"].includes(importSource)) return true;
  if (meta.jaaRowKind != null) {
    const src = String(payload.entrySource || "");
    if (src !== "driver-portal" && src !== "admin-manual") return true;
  }
  return false;
}

function countsInGasCardSpend(payload: Record<string, unknown> | null, amount: number): boolean {
  if (!payload || !(amount > 0)) return false;
  if (isStatementEntry(payload)) {
    const meta = (payload.metadata || {}) as Record<string, unknown>;
    if (meta.jaaRowKind === "fee" || meta.jaaRowKind === "declined") return false;
    return meta.jaaRowKind === "approved_fuel" || Number(amount) > 0;
  }
  // ops: any positive gas-card shaped amount in settled list counts
  return true;
}

async function loadEntryPayloads(
  client: ReturnType<typeof sb>,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!ids.length) return map;
  const { data, error } = await client
    .from("fleet_fuel_entries")
    .select("id, payload_json")
    .in("id", ids);
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    map.set(String(row.id), (row.payload_json || {}) as Record<string, unknown>);
  }
  return map;
}

async function restateWeek(
  client: ReturnType<typeof sb>,
  week: string,
  driverOverstatement: number,
  statementSpendHint: number,
) {
  const kvKey = `finalized_report:${week}:${DRIVER}`;
  const periodId = `${ORG}:${week}`;

  console.log(JSON.stringify({ phase: "calendar_reopen", week }));
  const reopen = await reopenWeek(
    ORG,
    week,
    ACTOR,
    `Gas card audit V12: restate week ${week} — remove statement rows from frozen snap`,
    true,
  );
  console.log(JSON.stringify({ phase: "calendar_reopen_done", week, ...reopen }));

  const { data: kvRow, error: kvErr } = await client
    .from("kv_store_37f42386")
    .select("value")
    .eq("key", kvKey)
    .maybeSingle();
  if (kvErr) throw new Error(kvErr.message);
  if (!kvRow?.value) throw new Error(`Missing snap ${kvKey}`);

  const snap = { ...(kvRow.value as Record<string, unknown>) };
  const meta = { ...((snap.metadata as Record<string, unknown>) || {}) };
  const settled = Array.isArray(meta.settledEntries)
    ? (meta.settledEntries as Array<Record<string, unknown>>)
    : [];

  const ids = settled.map((e) => String(e.id || "")).filter(Boolean);
  const payloads = await loadEntryPayloads(client, ids);

  let statementSpendRemoved = 0;
  const opsOnly: Array<Record<string, unknown>> = [];
  for (const stub of settled) {
    const id = String(stub.id || "");
    const payload = payloads.get(id) || null;
    const amount = Math.abs(Number(stub.amount) || Number(payload?.amount) || 0);
    if (isStatementEntry(payload)) {
      if (countsInGasCardSpend(payload, amount)) statementSpendRemoved += amount;
      continue;
    }
    opsOnly.push(stub);
  }
  if (statementSpendHint > 0 && statementSpendRemoved === 0) {
    statementSpendRemoved = statementSpendHint;
  }

  const before = {
    driverShare: Number(snap.driverShare) || 0,
    companyShare: Number(snap.companyShare) || 0,
    totalGasCardCost: Number(snap.totalGasCardCost) || 0,
    gasCardSpend: Number(snap.gasCardSpend) || 0,
    settledN: settled.length,
  };

  const nextDriver = Math.max(0, before.driverShare - driverOverstatement);
  const nextTotal = Math.max(0, before.totalGasCardCost - statementSpendRemoved);
  const companyReduction = Math.max(0, statementSpendRemoved - driverOverstatement);
  const nextCompany = Math.max(0, before.companyShare - companyReduction);
  // gasCardSpend: drop statement-approved portion only
  const nextGas = Math.max(0, before.gasCardSpend - statementSpendRemoved);

  snap.driverShare = nextDriver;
  snap.postedDriverShare = nextDriver;
  snap.companyShare = nextCompany;
  snap.postedCompanyShare = nextCompany;
  snap.totalGasCardCost = nextTotal;
  if (Number.isFinite(before.gasCardSpend)) snap.gasCardSpend = nextGas;
  meta.settledEntries = opsOnly;
  meta.v12Restate = {
    at: new Date().toISOString(),
    by: ACTOR,
    before,
    statementSpendRemoved,
    driverOverstatement,
    settledRemoved: settled.length - opsOnly.length,
  };
  snap.metadata = meta;

  const { error: upErr } = await client.from("kv_store_37f42386").upsert({
    key: kvKey,
    value: snap,
  });
  if (upErr) throw new Error(`KV upsert: ${upErr.message}`);

  const now = new Date().toISOString();
  const periodPatch: Record<string, unknown> = {
    driver_share: nextDriver,
    company_share: nextCompany,
    total_spend: nextTotal,
    status: "locked",
    locked_at: now,
    reopened_at: now,
    reopen_reason: `Gas card audit V12: restated snap — removed ${settled.length - opsOnly.length} statement settledEntries`,
    updated_at: now,
    computed_from_hash: "finalized:v12",
  };
  if (Number.isFinite(before.gasCardSpend)) {
    periodPatch.gas_card_spend = nextGas;
  }
  const { error: periodErr } = await client
    .from("fuel_reconciliation_period")
    .update(periodPatch)
    .eq("id", periodId);
  if (periodErr) throw new Error(`period update: ${periodErr.message}`);

  const sealed = await sealFuelWeek({
    organizationId: ORG,
    weekKey: week,
    actorId: ACTOR,
    force: true,
    amountsByDriver: {
      [DRIVER]: {
        driverShare: nextDriver,
        companyShare: nextCompany,
        totalSpend: nextTotal,
        miscellaneousCost: Number(snap.miscellaneousCost) || 0,
      },
    },
  });

  // Re-close Kenny's DFP (calendar reopen left it reopened)
  const { data: dfp, error: dfpErr } = await client
    .from("driver_financial_periods")
    .select("id, status, fuel_deduction, metadata")
    .eq("organization_id", ORG)
    .eq("driver_id", DRIVER)
    .eq("period_anchor", week)
    .maybeSingle();
  if (dfpErr) throw new Error(dfpErr.message);
  if (dfp?.id) {
    const { error: closeErr } = await client
      .from("driver_financial_periods")
      .update({
        status: "closed",
        closed_at: now,
        fuel_finalized: true,
        metadata: {
          ...(dfp.metadata || {}),
          v12Restate: {
            at: now,
            priorFuelDeduction: dfp.fuel_deduction,
            note: "Calendar re-closed after V12 snap restate; wallet already correct",
          },
        },
      })
      .eq("id", dfp.id);
    if (closeErr) throw new Error(closeErr.message);
  }

  console.log(
    JSON.stringify({
      phase: "restated",
      week,
      before,
      after: {
        driverShare: nextDriver,
        companyShare: nextCompany,
        totalGasCardCost: nextTotal,
        gasCardSpend: nextGas,
        settledN: opsOnly.length,
      },
      seal: sealed,
    }),
  );
}

async function main() {
  const client = sb();
  // Process oldest first
  for (const w of WEEKS) {
    let statementSpend = w.statementSpendRemoved;
    if (statementSpend === 0) {
      // Pre-compute from snap classification
      const kvKey = `finalized_report:${w.week}:${DRIVER}`;
      const { data: kvRow } = await client
        .from("kv_store_37f42386")
        .select("value")
        .eq("key", kvKey)
        .maybeSingle();
      const snap = (kvRow?.value || {}) as Record<string, unknown>;
      const settled = Array.isArray((snap.metadata as any)?.settledEntries)
        ? ((snap.metadata as any).settledEntries as Array<Record<string, unknown>>)
        : [];
      const ids = settled.map((e) => String(e.id || "")).filter(Boolean);
      const payloads = await loadEntryPayloads(client, ids);
      for (const stub of settled) {
        const id = String(stub.id || "");
        const payload = payloads.get(id) || null;
        const amount = Math.abs(Number(stub.amount) || 0);
        if (isStatementEntry(payload) && countsInGasCardSpend(payload, amount)) {
          statementSpend += amount;
        }
      }
    }
    await restateWeek(client, w.week, w.driverOverstatement, statementSpend);
  }
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});
