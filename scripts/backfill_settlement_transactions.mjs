#!/usr/bin/env node
/**
 * Backfill ledger.driver_settlement_transactions from fleet.transactions.
 * (KV transaction: keys are empty after fleet-table cutover.)
 * Run before SETTLEMENT_TX_TABLE_READ=true.
 */
import { createClient } from "@supabase/supabase-js";
import {
  isSettlementParticipantTransaction,
  resolveTransactionPeriodAnchor,
} from "./lib/settlementParticipant.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tz = process.env.FLEET_TZ || "America/Jamaica";
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);

function rowToTx(row) {
  const payload =
    row.payload_json && typeof row.payload_json === "object" ? { ...row.payload_json } : {};
  if (!payload.id) payload.id = row.id;
  if (!payload.driverId) payload.driverId = row.driver_id;
  if (!payload.date && row.date) payload.date = row.date;
  if (!payload.type && row.type) payload.type = row.type;
  if (!payload.category && row.category) payload.category = row.category;
  if (payload.amount == null && row.amount != null) payload.amount = Number(row.amount);
  if (!payload.status && row.status) payload.status = row.status;
  return payload;
}

async function main() {
  let offset = 0;
  const page = 500;
  let upserted = 0;
  let skipped = 0;
  while (true) {
    const { data, error } = await sb
      .schema("fleet")
      .from("transactions")
      .select("id, driver_id, date, type, category, amount, status, payload_json")
      .range(offset, offset + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const tx = rowToTx(row);
      if (!tx?.id || !tx?.driverId || !isSettlementParticipantTransaction(tx)) {
        skipped++;
        continue;
      }
      const anchor = resolveTransactionPeriodAnchor(tx, tz);
      if (!anchor) {
        skipped++;
        continue;
      }
      const { error: upErr } = await sb.schema("ledger").from("driver_settlement_transactions").upsert(
        {
          driver_id: String(tx.driverId),
          period_anchor: anchor,
          transaction_id: String(tx.id),
          payload: tx,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "driver_id,transaction_id" },
      );
      if (!upErr) upserted++;
      else console.error("upsert failed", tx.id, upErr.message);
    }
    offset += page;
    if (data.length < page) break;
  }
  console.log(`Backfill complete: ${upserted} rows upserted, ${skipped} skipped`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
