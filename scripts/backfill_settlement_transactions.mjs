#!/usr/bin/env node
/**
 * Backfill ledger.driver_settlement_transactions from KV transaction: keys.
 * Run once before SETTLEMENT_TX_TABLE_READ=true.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);

function isSettlementTx(tx) {
  const cat = String(tx?.category || "");
  const type = String(tx?.type || "");
  if (cat === "Cash Collection" && type === "Payment_Received") return true;
  if (cat === "Driver Payout" || type === "Driver_Payout") return true;
  return false;
}

function periodAnchor(tx) {
  const m = tx?.metadata || {};
  const start = m.workPeriodStart || m.periodAnchor;
  if (start) return String(start).slice(0, 10);
  return String(tx?.date || "").slice(0, 10) || null;
}

async function main() {
  let offset = 0;
  const page = 500;
  let upserted = 0;
  while (true) {
    const { data, error } = await sb
      .from("kv_store_37f42386")
      .select("key, value")
      .like("key", "transaction:%")
      .range(offset, offset + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const tx = row.value;
      if (!tx?.id || !tx?.driverId || !isSettlementTx(tx)) continue;
      const anchor = periodAnchor(tx);
      if (!anchor) continue;
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
    }
    offset += page;
    if (data.length < page) break;
  }
  console.log(`Backfill complete: ${upserted} rows upserted`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
