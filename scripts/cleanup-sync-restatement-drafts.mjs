#!/usr/bin/env node
/**
 * Delete junk Close-sync restatement drafts (draft + supersedes on open weeks
 * or close_precondition_unverified). Does NOT touch period money or closed seals.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… ORGANIZATION_ID=… \
 *     node scripts/cleanup-sync-restatement-drafts.mjs [--dry]
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orgId = process.env.ORGANIZATION_ID || "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823";
const dry = process.argv.includes("--dry");

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);

function isFrozen(p) {
  const meta = p.metadata || {};
  const fc = meta.financeCore || {};
  return (
    meta.periodFrozen === true ||
    fc.periodFrozen === true ||
    Boolean(fc.signedAt) ||
    String(p.settlement_status || "") === "signed"
  );
}

async function main() {
  const { data: drafts, error } = await sb
    .from("week_statements")
    .select("id, driver_id, week_key, kind, version, close_reason, supersedes, status")
    .eq("organization_id", orgId)
    .eq("status", "draft")
    .not("supersedes", "is", null);
  if (error) throw error;

  const rows = drafts || [];
  if (!rows.length) {
    console.log("No draft+supersedes rows.");
    return;
  }

  const weekKeys = [...new Set(rows.map((r) => String(r.week_key).slice(0, 10)))];
  const driverIds = [...new Set(rows.map((r) => r.driver_id))];
  const { data: periods, error: perr } = await sb
    .from("driver_financial_periods")
    .select("driver_id, period_anchor, settlement_status, metadata")
    .eq("organization_id", orgId)
    .in("period_anchor", weekKeys)
    .in("driver_id", driverIds);
  if (perr) throw perr;

  const frozen = new Set();
  for (const p of periods || []) {
    if (isFrozen(p)) frozen.add(`${p.driver_id}|${String(p.period_anchor).slice(0, 10)}`);
  }

  const junk = rows.filter((r) => {
    const k = `${r.driver_id}|${String(r.week_key).slice(0, 10)}`;
    const openWeek = !frozen.has(k);
    const unverified = String(r.close_reason || "") === "close_precondition_unverified";
    return openWeek || unverified;
  });

  console.log(`Candidates: ${rows.length} draft+supersedes; junk to delete: ${junk.length}${dry ? " (dry)" : ""}`);
  for (const r of junk.slice(0, 40)) {
    console.log(`  ${r.week_key} ${r.kind} v${r.version} ${r.close_reason || ""}`);
  }
  if (junk.length > 40) console.log(`  … +${junk.length - 40} more`);

  if (dry || junk.length === 0) return;

  const ids = junk.map((r) => r.id);
  const chunk = 100;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { error: delErr, count } = await sb
      .from("week_statements")
      .delete({ count: "exact" })
      .in("id", slice)
      .eq("organization_id", orgId)
      .eq("status", "draft");
    if (delErr) throw delErr;
    deleted += count ?? slice.length;
  }
  console.log(`Deleted ${deleted} junk draft(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
