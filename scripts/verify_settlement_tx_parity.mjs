#!/usr/bin/env node
/**
 * Mirror-vs-fleet.transactions parity for A-11 cutover.
 * Fail if any settlement-participant tx is missing from ledger.driver_settlement_transactions.
 *
 * Optional: DRIVER_IDS=id1,id2 to sample.
 */
import { createClient } from "@supabase/supabase-js";
import { isSettlementParticipantTransaction } from "./lib/settlementParticipant.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);
const filterDrivers = (process.env.DRIVER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function rowToTx(row) {
  const payload =
    row.payload_json && typeof row.payload_json === "object" ? { ...row.payload_json } : {};
  if (!payload.id) payload.id = row.id;
  if (!payload.driverId) payload.driverId = row.driver_id;
  if (!payload.type && row.type) payload.type = row.type;
  if (!payload.category && row.category) payload.category = row.category;
  if (payload.amount == null && row.amount != null) payload.amount = Number(row.amount);
  if (!payload.status && row.status) payload.status = row.status;
  return payload;
}

async function loadFleetParticipants() {
  const byDriver = new Map();
  let offset = 0;
  const page = 500;
  while (true) {
    const { data, error } = await sb
      .schema("fleet")
      .from("transactions")
      .select("id, driver_id, type, category, amount, status, payload_json")
      .range(offset, offset + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const tx = rowToTx(row);
      if (!tx?.id || !tx?.driverId) continue;
      if (filterDrivers.length && !filterDrivers.includes(String(tx.driverId))) continue;
      if (!isSettlementParticipantTransaction(tx)) continue;
      const did = String(tx.driverId);
      if (!byDriver.has(did)) byDriver.set(did, new Set());
      byDriver.get(did).add(String(tx.id));
    }
    offset += page;
    if (data.length < page) break;
  }
  return byDriver;
}

async function loadMirroredIds(driverId) {
  const ids = new Set();
  let offset = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await sb
      .schema("ledger")
      .from("driver_settlement_transactions")
      .select("transaction_id")
      .eq("driver_id", driverId)
      .range(offset, offset + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) ids.add(String(r.transaction_id));
    offset += page;
    if (data.length < page) break;
  }
  return ids;
}

async function main() {
  const fleet = await loadFleetParticipants();
  let totalMiss = 0;
  let totalExtra = 0;
  let drivers = 0;
  for (const [driverId, fleetIds] of fleet) {
    drivers++;
    const mirrored = await loadMirroredIds(driverId);
    const misses = [...fleetIds].filter((id) => !mirrored.has(id));
    const extras = [...mirrored].filter((id) => !fleetIds.has(id));
    totalMiss += misses.length;
    totalExtra += extras.length;
    if (misses.length || extras.length) {
      console.log(
        JSON.stringify({
          driverId,
          fleetCount: fleetIds.size,
          mirrorCount: mirrored.size,
          misses: misses.slice(0, 20),
          extras: extras.slice(0, 20),
        }),
      );
    }
  }
  console.log(
    JSON.stringify({
      drivers,
      misses: totalMiss,
      extras: totalExtra,
      ok: totalMiss === 0,
    }),
  );
  if (totalMiss > 0) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
