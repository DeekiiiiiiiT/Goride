#!/usr/bin/env node
/**
 * Pass 4 shadow run — compare latest week_statements to driver_financial_periods.
 * Gate for flipping PROJECTION_READS_WEEK_STATEMENTS: zero drift (≤1¢) for the week.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/shadow-week-statements.mjs [--week=YYYY-MM-DD] [--org=<uuid>] [--since=YYYY-MM-DD]
 *
 * Without --week, shadows every period_anchor from --since (default: 4 Mondays back).
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
};
const weekFilter = getArg("week");
const orgFilter = getArg("org");
const since =
  getArg("since") ||
  (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 28);
    // Snap to Monday
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().slice(0, 10);
  })();

const sb = createClient(url, key);
const EPS_MINOR = 1;

const SHADOW_MAP = {
  fuel: {
    driverShare: "fuel_deduction",
    companyShare: "fuel_fleet_share",
  },
  toll: {
    totalSpend: "toll_spend",
    chargedToDriver: "toll_charged_to_driver",
    reimbursed: "toll_reimbursed",
  },
  earnings: {
    driverShare: "driver_share",
    companyShare: "fleet_share",
    tipsPaidToDriver: "tips_paid_to_driver",
    passengerCash: "cash_collected",
    gross: "earnings_gross",
  },
};

function projectionMinor(row, col) {
  return Math.round((Number(row[col]) || 0) * 100);
}

async function loadPeriods() {
  let q = sb
    .from("driver_financial_periods")
    .select(
      "organization_id, driver_id, period_anchor, fuel_deduction, fuel_fleet_share, toll_spend, toll_charged_to_driver, toll_reimbursed, cash_collected, driver_share, fleet_share, tips_paid_to_driver, earnings_gross",
    )
    .order("period_anchor", { ascending: true })
    .order("driver_id", { ascending: true });
  if (weekFilter) q = q.eq("period_anchor", weekFilter);
  else q = q.gte("period_anchor", since);
  if (orgFilter) q = q.eq("organization_id", orgFilter);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function loadLatestStatements(orgId, driverId, weekKey) {
  const { data, error } = await sb
    .from("week_statements")
    .select("kind, status, version, amounts_minor, close_reason, closed_by")
    .eq("organization_id", orgId)
    .eq("driver_id", driverId)
    .eq("week_key", weekKey)
    .in("status", ["closed", "draft"])
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  const byKind = new Map();
  for (const row of data || []) {
    if (!byKind.has(row.kind)) byKind.set(row.kind, row);
  }
  return byKind;
}

function driftsFor(statement, period) {
  const map = SHADOW_MAP[statement.kind] || {};
  const out = [];
  for (const [amountKey, col] of Object.entries(map)) {
    const stmt = Math.round(Number(statement.amounts_minor?.[amountKey]) || 0);
    const proj = projectionMinor(period, col);
    const delta = stmt - proj;
    if (Math.abs(delta) > EPS_MINOR) {
      out.push({
        kind: statement.kind,
        field: amountKey,
        statementMinor: stmt,
        projectionMinor: proj,
        deltaMinor: delta,
        statementMajor: stmt / 100,
        projectionMajor: proj / 100,
        deltaMajor: delta / 100,
        status: statement.status,
        closeReason: statement.close_reason || null,
      });
    }
  }
  return out;
}

const periods = await loadPeriods();
const report = {
  ranAt: new Date().toISOString(),
  since: weekFilter || since,
  weekFilter,
  orgFilter,
  periodCount: periods.length,
  cleanCount: 0,
  driftCount: 0,
  missingLanes: [],
  drifts: [],
  cleanWeeks: [],
};

for (const p of periods) {
  const orgId = p.organization_id;
  const driverId = p.driver_id;
  const weekKey = String(p.period_anchor).slice(0, 10);
  if (!orgId) {
    report.missingLanes.push({ driverId, weekKey, reason: "null_organization_id" });
    continue;
  }
  const byKind = await loadLatestStatements(orgId, driverId, weekKey);
  const needed = ["fuel", "toll", "earnings"];
  const missing = needed.filter((k) => !byKind.has(k));
  if (missing.length) {
    report.missingLanes.push({ organizationId: orgId, driverId, weekKey, missing });
  }
  let weekDrifts = [];
  for (const kind of needed) {
    const stmt = byKind.get(kind);
    if (!stmt) continue;
    weekDrifts = weekDrifts.concat(driftsFor(stmt, p));
  }
  if (weekDrifts.length === 0 && missing.length === 0) {
    report.cleanCount += 1;
    report.cleanWeeks.push({ organizationId: orgId, driverId, weekKey });
  } else if (weekDrifts.length) {
    report.driftCount += weekDrifts.length;
    report.drifts.push({ organizationId: orgId, driverId, weekKey, fields: weekDrifts });
  }
}

const outDir = path.join("docs", "finance-recon");
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const outPath = path.join(outDir, `${stamp}-shadow-week-statements.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      outPath,
      periodCount: report.periodCount,
      cleanCount: report.cleanCount,
      driftRows: report.drifts.length,
      driftFields: report.driftCount,
      missingLaneRows: report.missingLanes.length,
      gate: report.driftCount === 0 && report.missingLanes.length === 0 ? "PASS" : "FAIL",
    },
    null,
    2,
  ),
);

if (report.driftCount > 0 || report.missingLanes.length > 0) process.exit(2);
