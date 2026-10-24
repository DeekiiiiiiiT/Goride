/**
 * One read for a Business Finance period: sealed statements, real payouts,
 * courier money, and tag top-ups. Rideshare profit is not mixed with courier.
 */
import type { Context } from "npm:hono@4.3.11";
import { getServiceClient } from "./service_client.ts";
import { getOrgId } from "./org_scope.ts";
import { requireAnyPermission, requireAuth } from "./rbac_middleware.ts";
import { OPS_HTTP_PREFIX } from "./ops_http_prefix.ts";
import {
  latestStatements,
  periodSealStatus,
  sumStatementAmount,
  type StatementFact,
} from "../../../packages/finance-core/src/businessWeekFacts.ts";
import { periodKeyFor, nextPeriodAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import { uberWeekNeedsStatement } from "../../../packages/finance-core/src/businessStatement.ts";

const PREFIX = `${OPS_HTTP_PREFIX}/business-finance`;

function ymd(value: unknown): string {
  return String(value || "").slice(0, 10);
}

export function weekKeysBetween(startYmd: string, endYmd: string): string[] {
  const start = periodKeyFor(startYmd);
  if (!start) return [];
  const keys: string[] = [];
  let cursor: string = start;
  for (let i = 0; i < 60 && cursor <= endYmd; i++) {
    keys.push(cursor);
    cursor = nextPeriodAnchor(cursor);
  }
  return keys;
}

type WeekRead = {
  weekStatus: "Closed" | "Open";
  earningsHeld: boolean;
  companyFuelSealed: boolean;
  sealedCompanyShare: number;
  engineCompanyShare: number;
  sealedFuelSpend: number;
  sealedEarningsGross: number;
  sealedTollNet: number;
  movementPays: number;
  movementCollects: number;
  tagTopUps: number;
  courierIn: number;
  courierOut: number;
  coverageRecognised: number;
  coveredSourceIds: string[];
  /** Closed Driver Settlements amount the company owes. */
  closedAmountOwed: number;
  bankDeposits: number;
  /** False when nobody has confirmed what landed in the bank. */
  bankConfirmed: boolean;
};

function emptyRead(): WeekRead {
  return {
    weekStatus: "Open",
    earningsHeld: false,
    companyFuelSealed: false,
    sealedCompanyShare: 0,
    engineCompanyShare: 0,
    sealedFuelSpend: 0,
    sealedEarningsGross: 0,
    sealedTollNet: 0,
    movementPays: 0,
    movementCollects: 0,
    tagTopUps: 0,
    courierIn: 0,
    courierOut: 0,
    coverageRecognised: 0,
    coveredSourceIds: [],
    closedAmountOwed: 0,
    bankDeposits: 0,
    bankConfirmed: false,
  };
}

function minor(n: unknown): number {
  return Math.round(Number(n) || 0) / 100;
}

export async function loadBusinessFinanceWeekRead(
  orgId: string,
  startYmd: string,
  endYmd: string,
): Promise<WeekRead> {
  const out = emptyRead();
  const weeks = weekKeysBetween(startYmd, endYmd);
  out.earningsHeld = weeks.some((week) => uberWeekNeedsStatement(week));
  const sb = getServiceClient();
  const ledger = sb.schema("ledger");

  const { data: statementRows } = await ledger
    .from("week_statements")
    .select("kind, driver_id, week_key, version, status, amounts_minor")
    .eq("organization_id", orgId)
    .gte("week_key", startYmd)
    .lte("week_key", endYmd)
    .limit(5000);
  const facts: StatementFact[] = (statementRows || []).map((row) => ({
    kind: String((row as { kind?: string }).kind || ""),
    driverId: String((row as { driver_id?: string }).driver_id || ""),
    weekKey: ymd((row as { week_key?: string }).week_key),
    version: Number((row as { version?: number }).version) || 1,
    status: String((row as { status?: string }).status || ""),
    amountsMinor: ((row as { amounts_minor?: Record<string, number> }).amounts_minor || {}) as Record<string, number>,
  }));
  const latest = latestStatements(facts);
  out.weekStatus = periodSealStatus(latest, weeks);
  out.sealedCompanyShare = sumStatementAmount(latest, "fuel", "companyShare");
  out.sealedFuelSpend = sumStatementAmount(latest, "fuel", "totalSpend");
  out.sealedEarningsGross = sumStatementAmount(latest, "earnings", "gross");
  out.sealedTollNet = sumStatementAmount(latest, "toll", "netLoss");
  const fuelRows = latest.filter((row) => row.kind === "fuel");
  out.companyFuelSealed = fuelRows.length > 0 && fuelRows.every((row) => row.status === "closed");

  const { data: movements } = await ledger
    .from("settlement_movements")
    .select("id, kind, status, amount_minor, reverses_movement_id, period_anchor")
    .eq("organization_id", orgId)
    .gte("period_anchor", startYmd)
    .lte("period_anchor", endYmd)
    .limit(5000);
  const reversedKind = new Map<string, string>();
  for (const row of movements || []) {
    const id = String((row as { id?: string }).id || "");
    if (id) reversedKind.set(id, String((row as { kind?: string }).kind || ""));
  }
  let paidMinor = 0;
  let collectedMinor = 0;
  for (const row of movements || []) {
    if (String((row as { status?: string }).status || "") !== "posted") continue;
    const amount = Number((row as { amount_minor?: number }).amount_minor) || 0;
    const kind = String((row as { kind?: string }).kind || "");
    if (kind === "pay") paidMinor += amount;
    else if (kind === "collect") collectedMinor += amount;
    else if (kind === "reverse") {
      const target = reversedKind.get(String((row as { reverses_movement_id?: string }).reverses_movement_id || ""));
      if (target === "collect") collectedMinor -= amount;
      else paidMinor -= amount;
    }
  }
  out.movementPays = Math.round(Math.max(0, paidMinor)) / 100;
  out.movementCollects = Math.round(Math.max(0, collectedMinor)) / 100;

  const { data: fuelPeriods } = await sb
    .from("fuel_reconciliation_period")
    .select("company_share, total_spend, status, week_start")
    .eq("org_id", orgId)
    .gte("week_start", startYmd)
    .lte("week_start", endYmd);
  let engine = 0;
  for (const row of fuelPeriods || []) {
    engine += Number((row as { company_share?: number }).company_share) || 0;
  }
  out.engineCompanyShare = Math.round(engine * 100) / 100;

  const { data: topUps } = await sb
    .from("ledger_entries")
    .select("amount_minor, entry_type")
    .eq("organization_id", orgId)
    .in("entry_type", ["toll_top_up", "tag_top_up"])
    .gte("effective_at", `${startYmd}T00:00:00.000Z`)
    .lte("effective_at", `${endYmd}T23:59:59.999Z`)
    .limit(2000);
  let topMinor = 0;
  for (const row of topUps || []) topMinor += Math.abs(Number((row as { amount_minor?: number }).amount_minor) || 0);
  out.tagTopUps = minor(topMinor);

  try {
    const { data: rush, error: rushError } = await sb.rpc("svc_rush_fleet_week_money", {
      p_org: orgId,
      p_start: startYmd,
      p_end: endYmd,
    });
    if (rushError) throw rushError;
    const row = (rush || {}) as { courier_in?: number; courier_out?: number };
    out.courierIn = minor(row.courier_in);
    out.courierOut = minor(row.courier_out);
  } catch (err) {
    console.warn("[business-finance] rush read skipped", err);
  }

  try {
    const { data: sides, error: sidesError } = await sb.rpc("svc_finance_week_sides", {
      p_org: orgId,
      p_start: startYmd,
      p_end: endYmd,
    });
    if (sidesError) throw sidesError;
    const row = (sides || {}) as { closed_owed?: number; bank_deposits?: number; bank_confirmed?: boolean };
    out.closedAmountOwed = Math.round((Number(row.closed_owed) || 0) * 100) / 100;
    out.bankDeposits = Math.round((Number(row.bank_deposits) || 0) * 100) / 100;
    out.bankConfirmed = Boolean(row.bank_confirmed);
  } catch (err) {
    console.warn("[business-finance] week sides skipped", err);
  }

  try {
    const { data: coverage, error: lineError } = await sb.rpc("svc_finance_coverage_lines", {
      p_org: orgId,
      p_start: startYmd,
      p_end: endYmd,
    });
    if (lineError) throw lineError;
    const ids = new Set<string>();
    let recognised = 0;
    for (const row of coverage || []) {
      recognised += Number((row as { amount?: number }).amount) || 0;
      const code = String((row as { line_code?: string }).line_code || "");
      if (code.startsWith("prepaid:")) ids.add(code.slice("prepaid:".length));
    }
    out.coverageRecognised = Math.round(recognised * 100) / 100;
    const { data: covers, error: coverError } = ids.size
      ? await sb.rpc("svc_coverage_contracts", { p_ids: [...ids] })
      : { data: [], error: null };
    if (coverError) throw coverError;
    out.coveredSourceIds = (covers || []).map((row) => String((row as { contract_id?: string }).contract_id || "")).filter(Boolean);
  } catch (err) {
    console.warn("[business-finance] coverage read skipped", err);
  }

  return out;
}

/** Write a period lock once fuel, tolls, and earnings for that week are sealed. */
export async function lockSealedFinanceWeeks(orgId: string, weekKeys: string[]): Promise<number> {
  const weeks = [...new Set(weekKeys.map((week) => week.slice(0, 10)).filter(Boolean))];
  if (!orgId || !weeks.length) return 0;
  const sb = getServiceClient();
  const { data: statementRows, error } = await sb.schema("ledger")
    .from("week_statements")
    .select("kind, driver_id, week_key, version, status, amounts_minor")
    .eq("organization_id", orgId)
    .in("week_key", weeks)
    .limit(5000);
  if (error || !statementRows?.length) return 0;
  const latest = latestStatements((statementRows || []).map((row) => ({
    kind: String((row as { kind?: string }).kind || ""),
    driverId: String((row as { driver_id?: string }).driver_id || ""),
    weekKey: ymd((row as { week_key?: string }).week_key),
    version: Number((row as { version?: number }).version) || 1,
    status: String((row as { status?: string }).status || ""),
    amountsMinor: {},
  })));
  let locked = 0;
  for (const week of weeks) {
    if (periodSealStatus(latest, [week]) !== "Closed") continue;
    const { error: lockError } = await sb.rpc("svc_lock_finance_week", {
      p_org: orgId,
      p_week: week,
    });
    if (!lockError) locked += 1;
  }
  return locked;
}

export function registerBusinessFinanceRoutes(app: {
  get: (path: string, ...handlers: unknown[]) => void;
}) {
  app.get(
    `${PREFIX}/week-read`,
    requireAuth(),
    requireAnyPermission("expenses.view", "transactions.view"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
      const startYmd = ymd(c.req.query("startYmd"));
      const endYmd = ymd(c.req.query("endYmd"));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) {
        return c.json({ error: "startYmd and endYmd are required" }, 400);
      }
      const data = await loadBusinessFinanceWeekRead(orgId, startYmd, endYmd);
      return c.json({ success: true, data });
    },
  );
}
