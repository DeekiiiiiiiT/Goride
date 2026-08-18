/**
 * finance-doctor — C1–C6 corruption classes against ledger.entries.
 * Usage: node scripts/finance-doctor.mjs
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * Exit 0 when every class is empty (C5 may be 0 forever).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);

function dollars(minor) {
  return Math.round(Number(minor || 0)) / 100;
}

const entries = [];
const page = 1000;
for (let from = 0; from < 50000; from += page) {
  const { data: rows, error } = await sb
    .from("ledger_entries")
    .select("id, idempotency_key, entry_type, amount_minor, effective_at, metadata, reference_id")
    .range(from, from + page - 1);
  if (error) {
    console.error(error.message);
    process.exit(2);
  }
  const chunk = rows || [];
  entries.push(...chunk);
  if (chunk.length < page) break;
}
const meta = (e) => (e.metadata && typeof e.metadata === "object" ? e.metadata : {});

const c1Clusters = [];
const cash = entries.filter((e) => e.entry_type === "payout_cash");
const cashGroups = new Map();
for (const e of cash) {
  const driver =
    String(meta(e).driverId || meta(e).driver_id || "")
      .trim()
      .toLowerCase() || "__none__";
  const d = String(e.effective_at || "").slice(0, 10);
  const amt = dollars(e.amount_minor);
  const k = `${driver}|${d}|${amt.toFixed(2)}`;
  if (!cashGroups.has(k)) cashGroups.set(k, []);
  cashGroups.get(k).push(e);
}

for (const [k, group] of cashGroups) {
  if (group.length < 2) continue;
  const uniq = new Set(group.map((e) => String(e.idempotency_key || "").trim()).filter(Boolean));
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
  (e) => e.entry_type === "toll_charge" && String(e.idempotency_key || "").includes(":trip:"),
);
const plazaTolls = entries.filter(
  (e) => e.entry_type === "toll_charge" && String(e.idempotency_key || "").includes("toll_ledger:"),
);
const tripReimburse = entries.filter(
  (e) => e.entry_type === "toll_reimbursement" && String(e.idempotency_key || "").includes(":trip:"),
);
const uniqueness = [];
const tripIdCounts = new Map();
for (const e of entries) {
  if (e.entry_type !== "toll_charge" && e.entry_type !== "toll_reimbursement") continue;
  const key = String(e.idempotency_key || "");
  const m = key.match(/:trip:([0-9a-f-]{36})/i) || key.match(/^trip:([0-9a-f-]{36})/i);
  if (!m) continue;
  const id = m[1].toLowerCase();
  if (!tripIdCounts.has(id)) tripIdCounts.set(id, []);
  tripIdCounts.get(id).push(e);
}
for (const [tripId, group] of tripIdCounts) {
  if (group.length < 2) continue;
  uniqueness.push({ tripId, copies: group.length, types: group.map((e) => e.entry_type) });
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
    posted: c1Clusters.reduce((s, c) => s + c.posted, 0),
    real: c1Clusters.reduce((s, c) => s + c.real, 0),
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
    types: Object.fromEntries(
      [...new Set(c4.map((e) => e.entry_type))].map((t) => [
        t,
        {
          n: c4.filter((e) => e.entry_type === t).length,
          dollars: c4
            .filter((e) => e.entry_type === t)
            .reduce((s, e) => s + Math.abs(dollars(e.amount_minor)), 0),
        },
      ]),
    ),
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

console.log(JSON.stringify(report, null, 2));
process.exit(blocking ? 3 : 0);
