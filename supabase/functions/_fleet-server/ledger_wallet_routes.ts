/**
 * Fleet Wallet snapshot — Money → Wallet desk.
 * Composes Layer B cash-held, Layer A driver debt rollup, and statement bankTransfer (Balance).
 * Roam Cash stays coming_soon until fleet org payout is productized.
 */
import type { Context, Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth } from "./rbac_middleware.ts";
import { filterByOrgSafe, getOrgId } from "./org_scope.ts";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { listCashHeldPeriods } from "./driver_financial_periods.ts";
import { buildOrgStatementSummaries } from "./ledger_query_summary_routes.ts";
import { getRidesPaymentDb } from "../_shared/ridesPaymentDb.ts";
import { driverDebtAccountKeyForUser } from "../rides/cashSettlement/buildJournalEntries.ts";

const PREFIX = "/make-server-37f42386";
const DRIVER_LIST_CAP = 5000;
const TOP_N = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function majorFromMinor(minor: number): number {
  return round2(minor / 100);
}

function payoutScheduledLabel(periodEndYmd: string): string {
  // Statement week ends Sunday; Uber-style payout lands the following Monday.
  const [y, m, d] = periodEndYmd.split("-").map(Number);
  const end = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  end.setUTCDate(end.getUTCDate() + 1);
  const day = end.getUTCDate();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${day} ${months[end.getUTCMonth()]}`;
}

async function loadOrgDrivers(c: Context): Promise<Record<string, unknown>[]> {
  let driversRaw: any[] = [];
  const { shouldReadTable, listByOrg } = await import("./repos/baseRepo.ts");
  if (shouldReadTable("drivers")) {
    const orgId = getOrgId(c);
    driversRaw = await listByOrg("drivers", orgId, { limit: DRIVER_LIST_CAP });
  } else {
    const { data, error } = await fromKvStore()
      .select("value")
      .like("key", "driver:%")
      .range(0, DRIVER_LIST_CAP - 1);
    if (error) throw error;
    driversRaw = data?.map((d: any) => d.value) || [];
  }
  return (await filterByOrgSafe(driversRaw, c, {
    endpoint: "/ledger/wallet-snapshot",
  })) as Record<string, unknown>[];
}

function driverIdsForDebt(d: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  for (const key of ["id", "userId", "roamId"] as const) {
    const v = String(d[key] || "").trim();
    if (v) ids.add(v);
  }
  return [...ids];
}

function driverDisplayName(d: Record<string, unknown>): string {
  return String(d.name || d.fullName || d.driverName || d.id || "Unknown").trim();
}

async function rollupFleetDriverDebt(
  drivers: Record<string, unknown>[],
): Promise<{
  amountMinor: number;
  driverCount: number;
  topDebtors: Array<{
    driverId: string;
    name: string;
    amountMinor: number;
  }>;
}> {
  const byDriver = new Map<
    string,
    { driverId: string; name: string; amountMinor: number; aliasIds: string[] }
  >();

  for (const d of drivers) {
    const primary = String(d.id || d.userId || "").trim();
    if (!primary) continue;
    byDriver.set(primary, {
      driverId: primary,
      name: driverDisplayName(d),
      amountMinor: 0,
      aliasIds: driverIdsForDebt(d),
    });
  }

  const allAliasIds = [...byDriver.values()].flatMap((r) => r.aliasIds);
  if (allAliasIds.length === 0) {
    return { amountMinor: 0, driverCount: 0, topDebtors: [] };
  }

  const accountKeys = [...new Set(allAliasIds.map((id) => driverDebtAccountKeyForUser(id)))];
  const aliasToPrimary = new Map<string, string>();
  for (const [primary, row] of byDriver) {
    for (const a of row.aliasIds) aliasToPrimary.set(a, primary);
  }

  const { db, tables } = await getRidesPaymentDb();
  // Chunk .in() to avoid URL limits on large fleets.
  const CHUNK = 80;
  for (let i = 0; i < accountKeys.length; i += CHUNK) {
    const slice = accountKeys.slice(i, i + CHUNK);
    const { data, error } = await db
      .from(tables.accounts)
      .select("account_key, user_id, balance_minor, currency")
      .in("account_key", slice);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const balance = Number(row.balance_minor) || 0;
      const arrears = Math.max(0, -balance);
      if (arrears <= 0) continue;
      const userId = String(row.user_id || "").trim();
      const key = String(row.account_key || "");
      const fromKey = key.startsWith("user:") && key.endsWith(":driver:debt")
        ? key.slice(5, -(":driver:debt".length))
        : "";
      const primary =
        (userId && aliasToPrimary.get(userId)) ||
        (fromKey && aliasToPrimary.get(fromKey)) ||
        null;
      if (!primary) continue;
      const bucket = byDriver.get(primary);
      if (!bucket) continue;
      bucket.amountMinor += arrears;
    }
  }

  const debtors = [...byDriver.values()]
    .filter((r) => r.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const amountMinor = debtors.reduce((s, r) => s + r.amountMinor, 0);
  return {
    amountMinor,
    driverCount: debtors.length,
    topDebtors: debtors.slice(0, TOP_N).map((r) => ({
      driverId: r.driverId,
      name: r.name,
      amountMinor: r.amountMinor,
    })),
  };
}

export function registerLedgerWalletRoutes(app: Hono) {
  // GET /ledger/wallet-snapshot?startDate=&endDate=
  app.get(`${PREFIX}/ledger/wallet-snapshot`, requireAuth({ requireOrg: true }), async (c) => {
    const t0 = Date.now();
    try {
      const startDate = c.req.query("startDate");
      const endDate = c.req.query("endDate");
      if (!startDate || !endDate) {
        return c.json({ error: "startDate and endDate are required" }, 400);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return c.json({ error: "startDate and endDate must be YYYY-MM-DD" }, 400);
      }

      const organizationId = getOrgId(c);
      if (!organizationId) {
        return c.json(
          { error: "ORG_REQUIRED", message: "organizationId is required for wallet snapshot" },
          400,
        );
      }

      const [cashRows, summaries, drivers] = await Promise.all([
        listCashHeldPeriods({
          organizationId,
          periodStart: startDate,
          periodEnd: endDate,
          limit: 500,
        }),
        buildOrgStatementSummaries(c, {
          startDate,
          endDate,
          platforms: ["Uber", "Roam", "InDrive"],
        }),
        loadOrgDrivers(c),
      ]);

      // Cash in Hand — Layer B custody (same queue as Settlements Collect)
      const heldByDriver = new Map<string, { driverId: string; name: string; amount: number }>();
      let cashTotal = 0;
      for (const r of cashRows) {
        const amount = Math.max(0, Number(r.amountOwed) || Number(r.cashStillHeld) || 0);
        if (amount <= 0.005) continue;
        cashTotal += amount;
        const id = String(r.driverId || "");
        const name = String((r as any).driverName || id);
        const prev = heldByDriver.get(id);
        if (prev) prev.amount = round2(prev.amount + amount);
        else heldByDriver.set(id, { driverId: id, name, amount: round2(amount) });
      }
      // Prefer roster names when available
      const nameById = new Map<string, string>();
      for (const d of drivers) {
        const id = String(d.id || "").trim();
        if (id) nameById.set(id, driverDisplayName(d));
      }
      const topHolders = [...heldByDriver.values()]
        .map((h) => ({
          ...h,
          name: nameById.get(h.driverId) || h.name,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, TOP_N);

      // Balance — platform bankTransfer (Roam+Uber+InDrive)
      const byPlatform = { roam: 0, uber: 0, indrive: 0 };
      let payoutObservedAny = false;
      let payoutGapAbs = 0;
      for (const s of summaries) {
        const bank = Number(s.bankTransfer) || 0;
        const plat = String(s.platform || "");
        if (plat === "Roam") byPlatform.roam = bank;
        else if (plat === "Uber") byPlatform.uber = bank;
        else if (plat === "InDrive") byPlatform.indrive = bank;
        if (s.payoutObserved) payoutObservedAny = true;
        payoutGapAbs = Math.max(payoutGapAbs, Math.abs(Number(s.payoutReconciliationGap) || 0));
      }
      const balanceAmount = round2(byPlatform.roam + byPlatform.uber + byPlatform.indrive);

      // Debt — Layer A driver:debt arrears rollup
      const debt = await rollupFleetDriverDebt(drivers);

      const snapshot = {
        asOf: new Date().toISOString(),
        period: { start: startDate, end: endDate },
        currency: "JMD",
        cashInHand: {
          amount: round2(cashTotal),
          amountMinor: Math.round(cashTotal * 100),
          driverCount: heldByDriver.size,
          topHolders: topHolders.map((h) => ({
            driverId: h.driverId,
            name: h.name,
            amount: h.amount,
            amountMinor: Math.round(h.amount * 100),
          })),
        },
        debt: {
          amount: majorFromMinor(debt.amountMinor),
          amountMinor: debt.amountMinor,
          driverCount: debt.driverCount,
          topDebtors: debt.topDebtors.map((d) => ({
            driverId: d.driverId,
            name: d.name,
            amount: majorFromMinor(d.amountMinor),
            amountMinor: d.amountMinor,
          })),
        },
        balance: {
          amount: balanceAmount,
          amountMinor: Math.round(balanceAmount * 100),
          byPlatform,
          payoutScheduledLabel: payoutScheduledLabel(endDate),
          payoutObserved: payoutObservedAny,
          payoutReconciliationGap: payoutGapAbs > 0.005 ? round2(payoutGapAbs) : 0,
        },
        roamCash: { status: "coming_soon" as const },
      };

      console.log(
        `[WalletSnapshot] org=${organizationId} range=${startDate}..${endDate} cash=${snapshot.cashInHand.amount} debt=${snapshot.debt.amount} balance=${snapshot.balance.amount} ${Date.now() - t0}ms`,
      );

      return c.json({ success: true, snapshot, meta: { durationMs: Date.now() - t0 } });
    } catch (e: any) {
      console.error("[WalletSnapshot] Error:", e?.message || e);
      if (String(e?.message || "").startsWith("ORG_REQUIRED")) {
        return c.json({ error: "ORG_REQUIRED", message: e.message }, 400);
      }
      return c.json({ error: `Wallet snapshot failed: ${e?.message || e}` }, 500);
    }
  });
}
