/**
 * Fleet Wallet snapshot — Money → Wallet desk.
 * Composes Layer B cash-held, Layer A driver debt rollup, and Bank Deposits SSOT for Balance.
 * Roam Cash stays coming_soon until fleet org payout is productized.
 */
import type { Context, Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import { requireAuth } from "./rbac_middleware.ts";
import { filterByOrg, filterByOrgSafe, getOrgId } from "./org_scope.ts";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { listCashHeldPeriods } from "./driver_financial_periods.ts";
import { getRidesPaymentDb } from "../_shared/ridesPaymentDb.ts";
import { driverDebtAccountKeyForUser } from "../_shared/ridesAccountKeys.ts";
import {
  DEFAULT_FLEET_TZ,
  periodKeyFor,
} from "../../../packages/finance-core/src/periodKey.ts";

const PREFIX = "/make-server-37f42386";
const DRIVER_LIST_CAP = 5000;
const TOP_N = 5;

type BankPlatform = "uber" | "roam" | "indrive";

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

function eventMeta(raw: Record<string, unknown>): Record<string, unknown> {
  const m = raw.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

function isOrgBankEvent(raw: Record<string, unknown>): boolean {
  if (String(raw.eventType || "") !== "payout_bank") return false;
  const meta = eventMeta(raw);
  if (meta.recipient === "org") return true;
  if (String(meta.source || "") === "payments_organization") return true;
  if (String(meta.bankRole || "") === "org_deposit") return true;
  return false;
}

function inferFleetBankPlatform(raw: Record<string, unknown>): BankPlatform {
  const meta = eventMeta(raw);
  const platform = String(meta.platform || meta.sourcePlatform || "").toLowerCase();
  if (platform.includes("indrive") || platform.includes("in_drive")) return "indrive";
  if (platform.includes("roam")) return "roam";
  return "uber";
}

function normalizeBankPlatform(raw: unknown): BankPlatform {
  const p = String(raw || "uber").toLowerCase();
  if (p === "indrive" || p === "roam" || p === "uber") return p;
  return "uber";
}

/**
 * Wallet Balance = Bank Deposits desk for the selected weeks (NOT Earnings statement bankTransfer).
 * Expected = org payout_bank weeks; Received = confirmed deposits; Outstanding = unconfirmed expected.
 * Avoids fake InDrive/Roam plugs and false "over-received" when confirms match real wires.
 */
async function buildBankDepositsBalanceForPeriod(
  c: Context,
  startDate: string,
  endDate: string,
): Promise<{
  expected: number;
  bankReceived: number;
  outstanding: number;
  byPlatform: { roam: number; uber: number; indrive: number };
  confirmedWeekCount: number;
  unconfirmedWeekCount: number;
}> {
  const {
    listAllUnifiedCanonicalEvents,
    dedupeOrgBankCanonicalEvents,
  } = await import("../_shared/unifiedLedger/queries.ts");

  const all = dedupeOrgBankCanonicalEvents(
    await listAllUnifiedCanonicalEvents({
      products: ["roam_driver", "roam_fleet"],
      entryTypes: ["payout_bank"],
      maxRows: 100_000,
    }),
  );
  const scoped = filterByOrg(all, c) as Record<string, unknown>[];

  const orgByWeek = new Map<string, number>();
  const allByWeek = new Map<string, number>();
  const platformByWeek = new Map<string, BankPlatform>();

  for (const raw of scoped) {
    if (String(raw.eventType || "") !== "payout_bank") continue;
    const date =
      String(raw.date || "").slice(0, 10) || String(raw.periodStart || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const weekStartYmd = periodKeyFor(date, DEFAULT_FLEET_TZ);
    if (!weekStartYmd) continue;
    const add = Math.abs(Number(raw.netAmount) || 0);
    if (add < 1e-9) continue;
    allByWeek.set(weekStartYmd, round2((allByWeek.get(weekStartYmd) || 0) + add));
    if (!platformByWeek.has(weekStartYmd) || isOrgBankEvent(raw)) {
      platformByWeek.set(weekStartYmd, inferFleetBankPlatform(raw));
    }
    if (isOrgBankEvent(raw)) {
      orgByWeek.set(weekStartYmd, round2((orgByWeek.get(weekStartYmd) || 0) + add));
    }
  }

  type ExpectedRow = { weekStartYmd: string; expected: number; platform: BankPlatform };
  const expectedRows: ExpectedRow[] = [];
  const weeks = new Set<string>([...allByWeek.keys(), ...orgByWeek.keys()]);
  for (const weekStartYmd of weeks) {
    if (weekStartYmd < startDate || weekStartYmd > endDate) continue;
    const orgAmt = orgByWeek.get(weekStartYmd);
    const expected =
      orgAmt != null && orgAmt > 0.005 ? orgAmt : allByWeek.get(weekStartYmd) || 0;
    if (expected <= 0.005) continue;
    expectedRows.push({
      weekStartYmd,
      expected: round2(expected),
      platform: platformByWeek.get(weekStartYmd) || "uber",
    });
  }

  const confirmItems = ((await kv.getByPrefix("fleet_bank_confirm:")) || []) as Record<
    string,
    unknown
  >[];
  const confirms = filterByOrg(confirmItems, c) as Record<string, unknown>[];

  // Dedupe dual-write confirms → week|platform → amountReceived
  const confirmByKey = new Map<string, number>();
  for (const row of confirms) {
    if (String(row.status || "") !== "confirmed") continue;
    const week = String(row.weekStartYmd || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) continue;
    const platform = normalizeBankPlatform(row.platform);
    const key = `${week}|${platform}`;
    if (!confirmByKey.has(key)) {
      confirmByKey.set(key, round2(Number(row.amountReceived) || 0));
    }
  }

  const byPlatform = { roam: 0, uber: 0, indrive: 0 };
  let expected = 0;
  let bankReceived = 0;
  let outstanding = 0;
  let confirmedWeekCount = 0;
  let unconfirmedWeekCount = 0;

  for (const row of expectedRows) {
    byPlatform[row.platform] = round2(byPlatform[row.platform] + row.expected);
    expected = round2(expected + row.expected);
    const key = `${row.weekStartYmd}|${row.platform}`;
    // Uber legacy week-only confirm (no platform split) — dual-read like Bank Deposits
    const received =
      confirmByKey.get(key) ??
      (row.platform === "uber" ? confirmByKey.get(`${row.weekStartYmd}|uber`) : undefined);
    // Also try resolves when confirm was stored without platform field defaulting uber
    const got = received != null ? received : undefined;
    if (got != null) {
      bankReceived = round2(bankReceived + got);
      confirmedWeekCount += 1;
    } else {
      // Awaiting confirmation — same meaning as Bank Deposits outstanding
      outstanding = round2(outstanding + row.expected);
      unconfirmedWeekCount += 1;
    }
  }

  return {
    expected,
    bankReceived,
    outstanding,
    byPlatform,
    confirmedWeekCount,
    unconfirmedWeekCount,
  };
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

      const [cashRows, drivers, bankBalance] = await Promise.all([
        listCashHeldPeriods({
          organizationId,
          periodStart: startDate,
          periodEnd: endDate,
          limit: 500,
        }),
        loadOrgDrivers(c),
        buildBankDepositsBalanceForPeriod(c, startDate, endDate).catch((e: any) => {
          console.error("[WalletSnapshot] bank deposits balance failed:", e?.message || e);
          return {
            expected: 0,
            bankReceived: 0,
            outstanding: 0,
            byPlatform: { roam: 0, uber: 0, indrive: 0 },
            confirmedWeekCount: 0,
            unconfirmedWeekCount: 0,
          };
        }),
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

      // Balance — Bank Deposits SSOT (payout_bank + confirms), not Earnings bankTransfer plug
      const { expected, bankReceived, outstanding, byPlatform } = bankBalance;

      // Debt — Layer A driver:debt arrears rollup (soft-fail: do not blank Balance/Cash)
      let debt: Awaited<ReturnType<typeof rollupFleetDriverDebt>> = {
        amountMinor: 0,
        driverCount: 0,
        topDebtors: [],
      };
      let debtError: string | undefined;
      try {
        debt = await rollupFleetDriverDebt(drivers);
      } catch (e: any) {
        debtError = String(e?.message || e);
        console.error("[WalletSnapshot] debt rollup failed:", debtError);
      }

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
          ...(debtError ? { error: debtError } : {}),
        },
        balance: {
          amount: outstanding,
          amountMinor: Math.round(outstanding * 100),
          expected,
          bankReceived,
          outstanding,
          byPlatform,
          payoutScheduledLabel:
            outstanding > 0.005 ? payoutScheduledLabel(endDate) : undefined,
        },
        roamCash: { status: "coming_soon" as const },
      };

      console.log(
        `[WalletSnapshot] org=${organizationId} range=${startDate}..${endDate} cash=${snapshot.cashInHand.amount} debt=${snapshot.debt.amount} expected=${expected} received=${bankReceived} outstanding=${outstanding} confirmed=${bankBalance.confirmedWeekCount} awaiting=${bankBalance.unconfirmedWeekCount} ${Date.now() - t0}ms`,
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
