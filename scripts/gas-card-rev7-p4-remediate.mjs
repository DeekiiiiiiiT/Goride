/**
 * P4 remedi: reverse statement-sourced Fuel Deduction txs for Kenny Aug weeks.
 * Append-only reversals (same pattern as reverseEnterpriseFuelSyncForSnapshot).
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const DRIVER = "73e5b1dc-01b4-45ee-a34a-25a3256b9841";
const IDS = [
  "22bdaf4a-159b-4907-b060-7895b872161a",
  "9ecca414-999c-4d02-85cb-9227a17c2d42",
  "98c6bf47-259f-429b-9cec-407fc4c4fc81",
  "d0242b30-b200-43b2-99bd-b246e424811e",
  "3f4b1d06-8a8b-4c52-b160-dc769b0af3cb",
  "121cbe14-e54b-4655-89e9-f10f763a6285",
  "b90c1cb3-19c0-45e1-876f-3ebb8d2be759",
];

function weekAnchor(date) {
  const d = String(date).slice(0, 10);
  if (d >= "2026-08-03" && d < "2026-08-10") return "2026-08-03";
  if (d >= "2026-08-10" && d < "2026-08-17") return "2026-08-10";
  if (d >= "2026-08-17" && d < "2026-08-24") return "2026-08-17";
  return "2026-08-24";
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { db: { schema: "fleet" } });
  const publicSb = createClient(url, key);

  const { data: rows, error } = await sb.from("transactions").select("*").in("id", IDS);
  if (error) throw error;

  const weekDelta = {};
  let inserted = 0;

  for (const d of rows || []) {
    const checkRes = await fetch(
      `${url}/rest/v1/transactions?select=id&payload_json->metadata->>reversesTransactionId=eq.${d.id}&limit=1`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Accept-Profile": "fleet",
        },
      },
    );
    const existing = await checkRes.json();
    if (Array.isArray(existing) && existing.length > 0) {
      console.log(JSON.stringify({ skip: d.id, reason: "already_reversed" }));
      continue;
    }

    const newId = randomUUID();
    const amount = -(Number(d.amount) || 0);
    const payload = {
      ...(d.payload_json || {}),
      id: newId,
      amount,
      metadata: {
        ...((d.payload_json && d.payload_json.metadata) || {}),
        reversesTransactionId: d.id,
        reversalReason: "gas_card_audit_rev7_statement_row_deduction",
        reversedAt: new Date().toISOString(),
        idempotencyKey: `reversal:${d.id}`,
        remediation: "P4: reverse statement-sourced Fuel Deduction",
      },
    };

    const insRes = await fetch(`${url}/rest/v1/transactions`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Accept-Profile": "fleet",
        "Content-Profile": "fleet",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        id: newId,
        organization_id: d.organization_id,
        date: d.date,
        driver_id: d.driver_id,
        vehicle_id: d.vehicle_id,
        trip_id: d.trip_id,
        type: d.type,
        category: d.category,
        amount,
        status: "Approved",
        batch_id: d.batch_id,
        payload_json: payload,
      }),
    });
    if (!insRes.ok) {
      console.error(JSON.stringify({ insertFail: d.id, body: await insRes.text() }));
      continue;
    }
    inserted += 1;
    const week = weekAnchor(d.date);
    weekDelta[week] = (weekDelta[week] || 0) + Math.abs(Number(d.amount) || 0);
  }

  console.log(JSON.stringify({ inserted, weekDelta }));

  for (const [week, removeAmt] of Object.entries(weekDelta)) {
    const { data: periods, error: pErr } = await publicSb
      .from("driver_financial_periods")
      .select("id, fuel_deduction, metadata")
      .eq("driver_id", DRIVER)
      .eq("period_anchor", week)
      .limit(1);
    if (pErr) throw pErr;
    const p = periods?.[0];
    if (!p) {
      console.error(JSON.stringify({ missingPeriod: week }));
      continue;
    }
    const next = Math.max(0, Number(p.fuel_deduction || 0) - removeAmt);
    const { error: uErr } = await publicSb
      .from("driver_financial_periods")
      .update({
        fuel_deduction: next,
        metadata: {
          ...(p.metadata || {}),
          gasCardAuditRev7Remediation: {
            at: new Date().toISOString(),
            removedStatementDeduction: removeAmt,
            priorFuelDeduction: p.fuel_deduction,
          },
        },
      })
      .eq("id", p.id);
    if (uErr) throw uErr;
    console.log(
      JSON.stringify({
        period: week,
        prior: p.fuel_deduction,
        next,
        removed: removeAmt,
      }),
    );
  }

  for (const week of ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"]) {
    const id = `8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823:${week}`;
    await publicSb
      .from("fuel_reconciliation_period")
      .update({
        reopen_reason: "Gas card audit Rev7 P4: statement-sourced Fuel Deduction reversed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
