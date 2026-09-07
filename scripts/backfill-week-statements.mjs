#!/usr/bin/env node
/**
 * Close Program Pass 2 — backfill earnings + toll week_statements from
 * driver_financial_periods so historical weeks can Close Week without waiting
 * for a fresh rebuild / seal per driver.
 *
 * Writes closed statements directly into ledger.week_statements matching the
 * publishWeekStatement shape (canonical amountsMinor keys + source_hash), one
 * version per lane. Idempotent: an unchanged closed lane is skipped; a changed
 * lane is superseded with version n+1.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/backfill-week-statements.mjs [--since=YYYY-MM-DD] [--org=<uuid>] [--dry]
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : null;
};
const since = getArg("since");
const orgFilter = getArg("org");
const dryRun = args.includes("--dry");

const ENGINE_VERSION = "week-statement@1";
const sb = createClient(url, key);
const cents = (n) => Math.round((Number(n) || 0) * 100);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Canonical hash (parity with packages/finance-core/src/closeHash.ts) ──────
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (value[k] === undefined) continue;
      out[k] = sortDeep(value[k]);
    }
    return out;
  }
  return value;
}
function hashStatement(s) {
  const payload = {
    kind: s.kind,
    organizationId: s.organizationId,
    driverId: s.driverId,
    weekKey: s.weekKey,
    version: s.version,
    engineVersion: ENGINE_VERSION,
    amountsMinor: s.amountsMinor,
    sourceRowIds: [...(s.sourceRowIds ?? [])].map(String).sort(),
  };
  return crypto.createHash("sha256").update(JSON.stringify(sortDeep(payload))).digest("hex");
}

function earningsAmounts(p) {
  return {
    passengerCash: cents(Math.max(0, Number(p.cash_collected) || 0)),
    driverShare: cents(p.driver_share),
    companyShare: cents(p.fleet_share),
    tipsPaidToDriver: cents(p.tips_paid_to_driver),
    gross: cents(p.earnings_gross),
    settlementAmount: cents(p.settlement_amount),
  };
}
function tollAmounts(p) {
  const tollSpend = round2(p.toll_spend);
  const chargedToDriver = round2(p.toll_charged_to_driver);
  const reimbursed = round2(p.toll_reimbursed);
  return {
    totalSpend: cents(tollSpend),
    chargedToDriver: cents(chargedToDriver),
    reimbursed: cents(reimbursed),
    netLoss: cents(round2(tollSpend - reimbursed - chargedToDriver)),
    cashWashSpend: cents(p.toll_cash_spend),
    tagSpend: cents(p.toll_tag_spend),
  };
}
function tollHasActivity(p) {
  return (
    round2(p.toll_spend) > 0.005 ||
    Math.abs(round2(p.toll_charged_to_driver)) > 0.005 ||
    Math.abs(round2(p.toll_reimbursed)) > 0.005
  );
}

async function latestStatement(orgId, driverId, weekKey, kind) {
  const { data, error } = await sb
    .schema("ledger")
    .from("week_statements")
    .select("id, version, status, amounts_minor")
    .eq("organization_id", orgId)
    .eq("driver_id", driverId)
    .eq("week_key", weekKey)
    .eq("kind", kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function publish({ orgId, driverId, weekKey, kind, amountsMinor, sourceRowIds }) {
  const latest = await latestStatement(orgId, driverId, weekKey, kind);
  const unchanged =
    latest &&
    latest.status === "closed" &&
    JSON.stringify(latest.amounts_minor) === JSON.stringify(amountsMinor);
  if (unchanged) return "skip";

  const version = (Number(latest?.version) || 0) + 1;
  const supersedes = latest && latest.status === "closed" ? latest.id : null;
  const now = new Date().toISOString();
  const stmt = { kind, organizationId: orgId, driverId, weekKey, version, amountsMinor, sourceRowIds };
  const row = {
    kind,
    organization_id: orgId,
    driver_id: driverId,
    week_key: weekKey,
    version,
    status: "closed",
    amounts_minor: amountsMinor,
    source_row_ids: sourceRowIds,
    source_hash: hashStatement(stmt),
    engine_version: ENGINE_VERSION,
    closed_at: now,
    closed_by: "backfill_script",
    close_reason: "pass2_backfill",
    supersedes,
  };
  if (dryRun) return "would-publish";

  const { error } = await sb.schema("ledger").from("week_statements").insert(row);
  if (error) throw error;
  if (supersedes) {
    await sb.schema("ledger").from("week_statements").update({ status: "restated" }).eq("id", supersedes);
  }
  return "publish";
}

async function main() {
  let offset = 0;
  const page = 500;
  const stats = { rows: 0, earnings: 0, toll: 0, skipped: 0 };
  while (true) {
    let q = sb
      .schema("ledger")
      .from("driver_financial_periods")
      .select(
        "id, organization_id, driver_id, period_anchor, cash_collected, driver_share, fleet_share, tips_paid_to_driver, earnings_gross, settlement_amount, toll_spend, toll_charged_to_driver, toll_reimbursed, toll_cash_spend, toll_tag_spend",
      )
      .order("period_anchor", { ascending: true })
      .range(offset, offset + page - 1);
    if (since) q = q.gte("period_anchor", since);
    if (orgFilter) q = q.eq("organization_id", orgFilter);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;

    for (const p of data) {
      stats.rows++;
      const orgId = p.organization_id;
      const driverId = String(p.driver_id || "");
      const weekKey = String(p.period_anchor || "").slice(0, 10);
      if (!orgId || !driverId || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) continue;

      const eRes = await publish({
        orgId,
        driverId,
        weekKey,
        kind: "earnings",
        amountsMinor: earningsAmounts(p),
        sourceRowIds: [String(p.id)],
      });
      if (eRes === "skip") stats.skipped++;
      else stats.earnings++;

      if (tollHasActivity(p)) {
        const tRes = await publish({
          orgId,
          driverId,
          weekKey,
          kind: "toll",
          amountsMinor: tollAmounts(p),
          sourceRowIds: [String(p.id)],
        });
        if (tRes === "skip") stats.skipped++;
        else stats.toll++;
      }
    }
    offset += page;
  }
  console.log(`${dryRun ? "[DRY] " : ""}Done:`, JSON.stringify(stats));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
