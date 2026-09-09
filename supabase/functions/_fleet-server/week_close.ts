/**
 * Real week close (audit §6.4, Phase 5 / C-6).
 *
 * closeWeek runs the cross-system invariants as a PRECONDITION of closing:
 * the period projection must tie to the independent fuel/toll/earnings
 * statements and to the earnings identity. Any failure blocks the close and
 * returns named, actionable drift records — no freeze is written. When every
 * driver ties, statements are signed, an H-4 close hash is stored, and freeze
 * metadata is written so no further movement can post to the week.
 *
 * N-11 honesty: calendar freeze is applied in one Postgres RPC (atomic freeze).
 * Statement sealing runs per-driver before that RPC (at-least-once statements).
 * If the freeze RPC fails after seals, use retryFreezeWeek — do not claim the
 * whole close was a single transaction.
 */
import { getServiceClient } from "./service_client.ts";
import {
  clearPeriodFreeze,
  isPeriodFrozen,
  markPeriodFrozen,
} from "./settlement_period_freeze.ts";
import {
  closeWeekStatements,
  getLatestWeekStatements,
  getLatestWeekStatementsForOrgWeek,
  hasPendingRestatementDrafts,
  listPendingRestatements,
  WEEK_STATEMENT_ENGINE_VERSION,
} from "./week_statements.ts";
import { sealTollWeek } from "./toll_week_seal.ts";
import { sealFuelWeek } from "./fuel_week_seal.ts";
import { sealEarningsWeek } from "./earnings_week_seal.ts";
import { compareDriverWeekStatementsToEngines } from "./statement_engine_probe.ts";
import { upsertFinanceReconDrifts, countOpenFinanceReconDrifts } from "./finance_recon_drift.ts";
import { weekPnlTieSides } from "./business_week_pnl.ts";
import { summarizeTollUsageOrphansForWeek } from "./toll_financial_reset.ts";
import { engineDriftsToCloseBlockers } from "../../../packages/finance-core/src/statementEngineCompare.ts";
import type { StatementEngineDrift } from "../../../packages/finance-core/src/statementEngineCompare.ts";
import {
  buildCloseHash,
  buildPeriodCloseHashPayload,
} from "../../../packages/finance-core/src/closeHash.ts";
import {
  checkCloseInvariants,
  canCloseWeek,
  CLOSE_INVARIANT_EPS,
  type CloseBlocker,
  type CloseEarningsStatement,
  type CloseFuelStatement,
  type ClosePeriodRow,
  type CloseTollStatement,
} from "../../../packages/finance-core/src/closeInvariants.ts";
import type { WeekStatement } from "../../../packages/finance-core/src/weekStatement.ts";

function sb() {
  return getServiceClient();
}

const minorToMajor = (m: unknown): number => (Number(m) || 0) / 100;

/** P-1: run async work in chunks to bound concurrency. */
async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Draft restatements (supersedes set) are amount-ready; treat as closed for invariants. */
function statementStatusForInvariants(
  s: WeekStatement,
  acceptRestatementDrafts: boolean,
): WeekStatement["status"] {
  if (acceptRestatementDrafts && s.status === "draft" && s.supersedes) return "closed";
  return s.status;
}

function fuelFromStatement(
  s: WeekStatement | undefined,
  acceptRestatementDrafts = false,
): CloseFuelStatement | null {
  if (!s) return null;
  return {
    driverShare: minorToMajor(s.amountsMinor.driverShare),
    companyShare: minorToMajor(s.amountsMinor.companyShare),
    status: statementStatusForInvariants(s, acceptRestatementDrafts),
  };
}

function tollFromStatement(
  s: WeekStatement | undefined,
  acceptRestatementDrafts = false,
): CloseTollStatement | null {
  if (!s) return null;
  return {
    totalSpend: minorToMajor(s.amountsMinor.totalSpend),
    chargedToDriver: minorToMajor(s.amountsMinor.chargedToDriver),
    reimbursed: minorToMajor(s.amountsMinor.reimbursed),
    netLoss: minorToMajor(s.amountsMinor.netLoss),
    cashWashSpend: minorToMajor(s.amountsMinor.cashWashSpend),
    tagSpend: minorToMajor(s.amountsMinor.tagSpend),
    status: statementStatusForInvariants(s, acceptRestatementDrafts),
  };
}

function earningsFromStatement(
  s: WeekStatement | undefined,
  acceptRestatementDrafts = false,
): CloseEarningsStatement | null {
  if (!s) return null;
  return {
    passengerCash: minorToMajor(s.amountsMinor.passengerCash),
    driverShare: minorToMajor(s.amountsMinor.driverShare),
    companyShare: minorToMajor(s.amountsMinor.companyShare),
    tipsPaidToDriver: minorToMajor(s.amountsMinor.tipsPaidToDriver),
    status: statementStatusForInvariants(s, acceptRestatementDrafts),
  };
}

/** Structured errors for week-close HTTP (409 settlement risk, etc.). */
export class WeekCloseError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "WeekCloseError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function periodIsFrozen(period: Record<string, unknown>): boolean {
  const meta = (period.metadata as Record<string, unknown> | null) || null;
  const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
  // R-2: do not read period.signed_at — column is never written; freeze is metadata-only.
  return isPeriodFrozen({
    metadata: meta,
    settlementStatus: period.settlement_status ? String(period.settlement_status) : null,
    signedAt: fc.signedAt ? String(fc.signedAt) : null,
  });
}

function settlementRiskForPeriod(period: Record<string, unknown>): {
  risk: boolean;
  settlementPaid: number;
  settlementAmount: number;
  cashCollected: number;
  cashWrittenOff: number;
} {
  // H-10: reopen risk includes payouts, collections, and write-offs — not payouts alone.
  const settlementPaid = Number(period.settlement_paid) || 0;
  const settlementAmount = Number(period.settlement_amount) || 0;
  const cashCollected = Number(period.cash_collected) || 0;
  const cashReturned = Number(period.cash_returned) || 0;
  const cashWrittenOff = Number(period.cash_written_off) || 0;
  const risk =
    Math.abs(settlementPaid) > CLOSE_INVARIANT_EPS ||
    Math.abs(cashReturned) > CLOSE_INVARIANT_EPS ||
    Math.abs(cashWrittenOff) > CLOSE_INVARIANT_EPS ||
    (Math.abs(cashCollected) > CLOSE_INVARIANT_EPS && Math.abs(cashReturned) > CLOSE_INVARIANT_EPS);
  return { risk, settlementPaid, settlementAmount, cashCollected, cashWrittenOff };
}

/** Complete row payload for the H-4 close hash (drops undefined). */
function closeHashRowFrom(period: Record<string, unknown>) {
  const n = (k: string) => Number(period[k]) || 0;
  return {
    tollSpend: n("toll_spend"),
    tollCashSpend: n("toll_cash_spend"),
    tollTagSpend: n("toll_tag_spend"),
    tollReimbursed: n("toll_reimbursed"),
    tollChargedToDriver: n("toll_charged_to_driver"),
    tollUnmatchedCount: n("toll_unmatched_count"),
    disputeRefundMatched: n("dispute_refund_matched"),
    disputeRefundUnmatched: n("dispute_refund_unmatched"),
    fuelDeduction: n("fuel_deduction"),
    fuelFleetShare: n("fuel_fleet_share"),
    fuelFinalized: Boolean(period.fuel_finalized),
    driverShare: n("driver_share"),
    fleetShare: n("fleet_share"),
    earningsGross: n("earnings_gross"),
    tipsPaidToDriver: n("tips_paid_to_driver"),
    cashCollected: n("cash_collected"),
    cashReturned: n("cash_returned"),
    cashStillHeld: n("cash_still_held"),
    settlementPaid: n("settlement_paid"),
    settlementAmount: n("settlement_amount"),
    payoutNet: n("payout_net"),
  };
}

export type WeekCloseFuelLane = {
  driverShare: number;
  fleetShare: number;
  finalized: boolean;
};

export type WeekCloseTollLane = {
  spend: number;
  reimbursed: number;
  chargedToDrivers: number;
  netLoss: number;
  identityResidual: number;
  identityCloses: boolean;
};

export type WeekClosePreview = {
  weekKey: string;
  driversTotal: number;
  driversReady: number;
  driversBlocked: number;
  /** Drivers whose period is already frozen / signed (week close done). */
  driversFrozen: number;
  /** True when every driver-period for the week is frozen. */
  weekClosed: boolean;
  /** Earliest freeze timestamp across frozen drivers, if any. */
  closedAt: string | null;
  fuel: WeekCloseFuelLane;
  toll: WeekCloseTollLane;
  blockers: CloseBlocker[];
  /** H-3: week-level facts (P&L tie, etc.) — not attributed to a random driver. */
  weekBlockers?: CloseBlocker[];
  /** Pass 5: open statement↔engine drift rows for this org (all weeks). */
  openEngineDriftCount?: number;
  /** Draft restatement rows (status=draft AND supersedes set) for this week. */
  pendingRestatementCount?: number;
  /** Frozen drivers with settlement_paid moved — reopen needs risk ack. */
  settlementRiskDriverCount?: number;
};

/**
 * Close Program Pass 3/5 precondition: refresh fuel/toll/earnings from
 * independent seals while the week is open.
 */
async function ensureCloseLaneStatements(
  orgId: string,
  week: string,
  actorId?: string,
  opts?: { forceTollReseal?: boolean },
): Promise<void> {
  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, fuel_finalized, settlement_status, metadata",
    )
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  let tollLaneMissing = false;
  let fuelLaneMissing = false;
  let earningsLaneMissing = false;
  let fuelNeedsSeal = false;
  let tollNeedsSeal = false;
  let tollStaleZeroNa = false;
  let earningsNeedsSeal = false;
  let anyOpenDriver = false;
  for (const p of periods ?? []) {
    const driverId = String(p.driver_id || "");
    if (!driverId) continue;
    const meta = (p.metadata as Record<string, unknown> | null) || null;
    const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
    const frozen = isPeriodFrozen({
      metadata: meta,
      settlementStatus: p.settlement_status ? String(p.settlement_status) : null,
      signedAt: fc.signedAt ? String(fc.signedAt) : null,
    });
    if (!frozen) anyOpenDriver = true;

    const statements = await getLatestWeekStatements(orgId, driverId, week);
    const byKind = new Map(statements.map((s) => [s.kind, s]));
    const fuel = byKind.get("fuel");
    const toll = byKind.get("toll");
    const earnings = byKind.get("earnings");

    if (!fuel) {
      fuelLaneMissing = true;
      fuelNeedsSeal = true;
    } else if (fuel.status !== "closed") {
      fuelNeedsSeal = true;
    }
    if (!toll) {
      tollLaneMissing = true;
      tollNeedsSeal = true;
    } else if (toll.status !== "closed") {
      tollNeedsSeal = true;
    } else if (String(toll.closeReason || "") === "zero_activity_na") {
      // May be stale if late toll_usage arrived — sealTollWeek re-checks events.
      tollStaleZeroNa = true;
    }
    if (!earnings) {
      earningsLaneMissing = true;
      earningsNeedsSeal = true;
    } else if (earnings.status !== "closed") {
      earningsNeedsSeal = true;
    }
  }

  // Pass 5: never clobber a standing closed independent seal during close.
  // Only seal missing/draft lanes (or when no closed statement exists).
  // Exception: zero_activity_na may be stale after late toll posts — re-run seal.
  if (fuelNeedsSeal || (anyOpenDriver && fuelLaneMissing)) {
    try {
      await sealFuelWeek({ organizationId: orgId, weekKey: week, actorId });
    } catch (e) {
      console.warn("[week_close] fuel auto-seal failed (non-fatal)", week, e);
    }
  }

  if (tollNeedsSeal || tollStaleZeroNa || opts?.forceTollReseal || (anyOpenDriver && tollLaneMissing)) {
    try {
      await sealTollWeek({
        organizationId: orgId,
        weekKey: week,
        actorId,
        force: Boolean(tollStaleZeroNa || opts?.forceTollReseal),
      });
    } catch (e) {
      console.warn("[week_close] toll auto-seal failed (non-fatal)", week, e);
    }
  }

  if (earningsNeedsSeal || (anyOpenDriver && earningsLaneMissing)) {
    try {
      await sealEarningsWeek({ organizationId: orgId, weekKey: week, actorId });
    } catch (e) {
      console.warn("[week_close] earnings auto-seal failed (non-fatal)", week, e);
    }
  }
}

/**
 * H-1: Pure read preview — does NOT seal lanes or write recon drifts.
 * Use {@link prepareWeekClose} before close when lanes need sealing.
 */
export async function previewWeekClose(orgId: string, weekKey: string): Promise<WeekClosePreview> {
  const week = String(weekKey).slice(0, 10);

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const rows = periods ?? [];
  const blockers: CloseBlocker[] = [];
  const weekBlockers: CloseBlocker[] = [];
  let driversReady = 0;
  let driversFrozen = 0;
  /** Frozen with no pending restatement drafts — done, excluded from blocked. */
  let driversFrozenIdle = 0;
  let closedAt: string | null = null;
  let pendingRestatementCount = 0;
  let settlementRiskDriverCount = 0;

  let fuelDriverShare = 0;
  let fuelFleetShare = 0;
  let fuelFinalized = rows.length > 0;
  let tollSpend = 0;
  let tollReimbursed = 0;
  let tollCharged = 0;
  let tollNetLoss = 0;

  // H-4 + N-4: one statement batch; settlement = statements, business = engines.
  const driverIds = rows.map((p) => String(p.driver_id)).filter(Boolean);
  const { statementsByDriver, settlementSumForWeek, businessWeekPnl } = await weekPnlTieSides(
    orgId,
    week,
    driverIds,
  );

  // H-3 / N-3: week-level P&L — block on mismatch (non-tautological statements↔engines).
  if (businessWeekPnl != null && Math.abs(settlementSumForWeek - businessWeekPnl) > CLOSE_INVARIANT_EPS) {
    weekBlockers.push({
      code: "SETTLEMENT_PNL_MISMATCH",
      severity: "block",
      week,
      persisted: settlementSumForWeek,
      expected: businessWeekPnl,
      delta: settlementSumForWeek - businessWeekPnl,
      message: "Week settlement composition (statements) does not tie to engine week P&L",
    });
  } else if (businessWeekPnl == null && settlementSumForWeek !== 0) {
    weekBlockers.push({
      code: "BUSINESS_WEEK_PNL_UNAVAILABLE",
      severity: "warn",
      week,
      persisted: settlementSumForWeek,
      expected: 0,
      delta: settlementSumForWeek,
      message: "Engine week P&L unavailable for settlement tie-out",
    });
  }

  // Dedup restatement drafts (U-6) — latest version per driver/week/kind.
  const draftKeys = new Set<string>();

  for (const period of rows) {
    const driverId = String(period.driver_id);
    const meta = (period.metadata as Record<string, unknown> | null) || null;
    const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
    const frozen = periodIsFrozen(period as Record<string, unknown>);

    const statements = statementsByDriver.get(driverId) ?? [];
    const pendingDrafts = hasPendingRestatementDrafts(statements);
    if (pendingDrafts) {
      for (const s of statements) {
        if (s.status === "draft" && Boolean(s.supersedes)) {
          const key = `${driverId}|${week}|${s.kind}`;
          if (!draftKeys.has(key)) {
            draftKeys.add(key);
            pendingRestatementCount += 1;
          }
        }
      }
    }

    if (frozen) {
      driversFrozen += 1;
      if (!pendingDrafts) driversFrozenIdle += 1;
      if (settlementRiskForPeriod(period as Record<string, unknown>).risk) {
        settlementRiskDriverCount += 1;
      }
      const signed = fc.signedAt ? String(fc.signedAt) : null;
      if (signed && (!closedAt || signed < closedAt)) closedAt = signed;
    }

    const acceptRestatementDrafts = frozen && pendingDrafts;
    const byKind = new Map<string, WeekStatement>(statements.map((s) => [s.kind, s]));

    const fuelStatement = fuelFromStatement(byKind.get("fuel"), acceptRestatementDrafts);
    const tollStatement = tollFromStatement(byKind.get("toll"), acceptRestatementDrafts);

    let engineBlockers: CloseBlocker[] = [];
    // H-1: preview is read-only — compare engines but do NOT upsert drifts.
    if (!frozen || acceptRestatementDrafts) {
      try {
        const engineDrifts = await compareDriverWeekStatementsToEngines({
          organizationId: orgId,
          driverId,
          weekKey: week,
          statements,
        });
        if (engineDrifts.length) {
          engineBlockers = engineDriftsToCloseBlockers(engineDrifts, {
            driverId,
            week,
          }) as CloseBlocker[];
        }
      } catch (e) {
        console.warn("[week_close] engine compare failed (non-fatal)", driverId, week, e);
      }
    }

    let tollEventLedger: {
      orphanCount: number;
      orphanAmountMajor: number;
      eventSpendMajor: number;
      ledgerSpendMajor: number;
    } | null = null;
    if (!frozen || acceptRestatementDrafts) {
      try {
        const sum = await summarizeTollUsageOrphansForWeek({
          periodAnchor: week,
          driverId,
        });
        tollEventLedger = {
          orphanCount: sum.orphanCount,
          orphanAmountMajor: sum.orphanAmountMajor,
          eventSpendMajor: sum.eventSpendMajor,
          ledgerSpendMajor: sum.ledgerSpendMajor,
          missingEventCount: sum.missingEventCount,
          missingEventAmountMajor: sum.missingEventAmountMajor,
          ineligibleEventCount: sum.ineligibleEventCount,
          ineligibleEventAmountMajor: sum.ineligibleEventAmountMajor,
          amountMismatchCount: sum.amountMismatchCount,
          amountMismatchAmountMajor: sum.amountMismatchAmountMajor,
        };
        if (
          sum.orphanCount > 0 ||
          sum.ineligibleEventCount > 0 ||
          sum.amountMismatchCount > 0 ||
          Math.abs(sum.eventSpendMajor - sum.ledgerSpendMajor) > CLOSE_INVARIANT_EPS
        ) {
          // H-1: preview does not write drifts — surface via engineBlockers only on prepare/close.
        }
      } catch (e) {
        console.warn("[week_close] toll orphan summarize failed (non-fatal)", driverId, week, e);
      }
    }

    const driverBlockers = checkCloseInvariants({
      period: period as ClosePeriodRow,
      fuelStatement,
      tollStatement,
      earningsStatement: earningsFromStatement(byKind.get("earnings"), acceptRestatementDrafts),
      cashSourceMismatch: Number(
        (meta as { financeCore?: { cashSourceMismatch?: number } } | null)
          ?.financeCore?.cashSourceMismatch,
      ) || 0,
      skipSettlementDeskClear: acceptRestatementDrafts,
      engineDrifts: engineBlockers,
      tollEventLedger,
      tollUnknownPmCount: Number(
        (meta as { financeCore?: { tollUnknownPmCount?: number } } | null)
          ?.financeCore?.tollUnknownPmCount,
      ) || 0,
      tollUnknownPmAmount: Number(
        (meta as { financeCore?: { tollUnknownPmAmount?: number } } | null)
          ?.financeCore?.tollUnknownPmAmount,
      ) || 0,
      // H-3: P&L is in weekBlockers — do not attribute to a driver here.
    });
    // Already-frozen without restatement drafts are done — not blockers.
    // Frozen WITH drafts surface blockers for Sign restatements.
    if (!frozen || acceptRestatementDrafts) {
      blockers.push(...driverBlockers);
      if (canCloseWeek(driverBlockers)) driversReady += 1;
    }

    if (fuelStatement) {
      fuelDriverShare += fuelStatement.driverShare;
      fuelFleetShare += fuelStatement.companyShare;
    }
    if (!period.fuel_finalized) fuelFinalized = false;

    if (tollStatement) {
      tollSpend += tollStatement.totalSpend;
      tollReimbursed += tollStatement.reimbursed ?? 0;
      tollCharged += tollStatement.chargedToDriver;
      tollNetLoss += tollStatement.netLoss ?? 0;
    }
  }

  const identityResidual =
    Math.round((tollSpend - tollReimbursed - tollCharged - tollNetLoss) * 100) / 100;
  const weekClosed = rows.length > 0 && driversFrozen === rows.length;
  const openEngineDriftCount = await countOpenFinanceReconDrifts(orgId, week);

  return {
    weekKey: week,
    driversTotal: rows.length,
    driversReady,
    driversBlocked: Math.max(0, rows.length - driversReady - driversFrozenIdle),
    driversFrozen,
    weekClosed,
    closedAt,
    fuel: {
      driverShare: Math.round(fuelDriverShare * 100) / 100,
      fleetShare: Math.round(fuelFleetShare * 100) / 100,
      finalized: fuelFinalized,
    },
    toll: {
      spend: Math.round(tollSpend * 100) / 100,
      reimbursed: Math.round(tollReimbursed * 100) / 100,
      chargedToDrivers: Math.round(tollCharged * 100) / 100,
      netLoss: Math.round(tollNetLoss * 100) / 100,
      identityResidual,
      identityCloses: Math.abs(identityResidual) <= CLOSE_INVARIANT_EPS,
    },
    blockers,
    weekBlockers,
    openEngineDriftCount,
    pendingRestatementCount,
    settlementRiskDriverCount,
  };
}

export type ClosedWeekSummary = {
  weekKey: string;
  driversTotal: number;
  driversFrozen: number;
  closedAt: string | null;
  pendingRestatementCount: number;
};

const WEEK_RE_INTERNAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Year-scoped directory of fully closed weeks (every driver-period frozen).
 * Not the Restatements queue — weeks with no drafts still appear here.
 */
export async function listClosedWeeks(
  orgId: string,
  opts?: { year?: number },
): Promise<ClosedWeekSummary[]> {
  const year = opts?.year && Number.isFinite(opts.year) ? Math.trunc(opts.year) : undefined;
  const from = year != null ? `${year}-01-01` : undefined;
  const to = year != null ? `${year}-12-31` : undefined;

  type Agg = {
    driversTotal: number;
    driversFrozen: number;
    closedAt: string | null;
  };
  const byWeek = new Map<string, Agg>();

  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let q = sb()
      .from("driver_financial_periods")
      .select("period_anchor, metadata, settlement_status")
      .eq("organization_id", orgId)
      .order("period_anchor", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (from) q = q.gte("period_anchor", from);
    if (to) q = q.lte("period_anchor", to);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) {
      const weekKey = String(row.period_anchor || "").slice(0, 10);
      if (!WEEK_RE_INTERNAL.test(weekKey)) continue;
      const cur = byWeek.get(weekKey) || {
        driversTotal: 0,
        driversFrozen: 0,
        closedAt: null as string | null,
      };
      cur.driversTotal += 1;
      const period = row as Record<string, unknown>;
      if (periodIsFrozen(period)) {
        cur.driversFrozen += 1;
        const meta = (period.metadata as Record<string, unknown> | null) || null;
        const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
        const signed = fc.signedAt ? String(fc.signedAt) : null;
        if (signed && (!cur.closedAt || signed < cur.closedAt)) cur.closedAt = signed;
      }
      byWeek.set(weekKey, cur);
    }
    if (batch.length < pageSize) break;
  }

  const draftCounts = new Map<string, number>();
  try {
    const drafts = await listPendingRestatements(orgId, { limit: 500, offset: 0 });
    for (const s of drafts) {
      const wk = String(s.weekKey || "").slice(0, 10);
      if (year != null && !wk.startsWith(String(year))) continue;
      draftCounts.set(wk, (draftCounts.get(wk) || 0) + 1);
    }
  } catch (e) {
    console.warn("[week_close] listClosedWeeks restatement counts failed (non-fatal)", e);
  }

  const out: ClosedWeekSummary[] = [];
  for (const [weekKey, agg] of byWeek) {
    if (agg.driversTotal <= 0 || agg.driversFrozen !== agg.driversTotal) continue;
    out.push({
      weekKey,
      driversTotal: agg.driversTotal,
      driversFrozen: agg.driversFrozen,
      closedAt: agg.closedAt,
      pendingRestatementCount: draftCounts.get(weekKey) || 0,
    });
  }
  out.sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  return out;
}

/**
 * H-1: Explicit prepare — seals missing lanes and persists recon drifts.
 * Call before close when operators want lanes ready; preview stays pure.
 */
export async function prepareWeekClose(
  orgId: string,
  weekKey: string,
  actorId: string,
): Promise<WeekClosePreview> {
  const week = String(weekKey).slice(0, 10);
  // Prepare is an explicit operator action — force toll reseal so plaza/events
  // can replace a stale FE-only or double-count seal before preview.
  await ensureCloseLaneStatements(orgId, week, actorId, { forceTollReseal: true });

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("driver_id")
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const driverIds = (periods ?? []).map((p) => String(p.driver_id || "")).filter(Boolean);
  const statementsByDriver = await getLatestWeekStatementsForOrgWeek(orgId, week);
  const pendingDrifts: Array<{
    driverId: string;
    drifts: StatementEngineDrift[];
    statementVersion: number | null;
  }> = [];

  await mapPool(driverIds, 8, async (driverId) => {
    try {
      const statements = statementsByDriver.get(driverId) ?? [];
      const engineDrifts = await compareDriverWeekStatementsToEngines({
        organizationId: orgId,
        driverId,
        weekKey: week,
        statements,
      });
      if (engineDrifts.length) {
        pendingDrifts.push({
          driverId,
          drifts: engineDrifts,
          statementVersion: statements[0]?.version ?? null,
        });
      }
    } catch (e) {
      console.warn("[week_close] prepare drift upsert failed (non-fatal)", driverId, week, e);
    }
  });

  // Single batch of drift upserts (one call per driver that drifted — still fewer round-trips than inline).
  for (const row of pendingDrifts) {
    try {
      await upsertFinanceReconDrifts({
        organizationId: orgId,
        driverId: row.driverId,
        weekKey: week,
        source: "close_prepare",
        drifts: row.drifts,
        statementVersion: row.statementVersion,
      });
    } catch (e) {
      console.warn("[week_close] prepare batch drift upsert failed", row.driverId, e);
    }
  }

  return previewWeekClose(orgId, week);
}

export type DriverCloseResult = {
  driverId: string;
  closed: boolean;
  closeHash?: string;
  blockers: CloseBlocker[];
};

export type CloseWeekResult = {
  organizationId: string;
  weekKey: string;
  closed: boolean;
  driversClosed: number;
  driversBlocked: number;
  blockers: CloseBlocker[];
  perDriver: DriverCloseResult[];
};

/**
 * Close every driver-period for an org-week. Atomic per driver: a driver whose
 * invariants fail is left open with its blockers; drivers that tie are signed.
 * The week is `closed` only when every driver closed with zero blockers.
 */
export async function closeWeek(
  orgId: string,
  weekKey: string,
  actorId: string,
  reason: string,
): Promise<CloseWeekResult> {
  const week = String(weekKey).slice(0, 10);

  await ensureCloseLaneStatements(orgId, week, actorId);

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const perDriver: DriverCloseResult[] = [];
  const allBlockers: CloseBlocker[] = [];
  const periodRows = periods ?? [];
  const driverIds = periodRows.map((p) => String(p.driver_id)).filter(Boolean);
  const { statementsByDriver, settlementSumForWeek, businessWeekPnl } = await weekPnlTieSides(
    orgId,
    week,
    driverIds,
  );

  // H-3 / N-3: week-level P&L — block before any freeze (never partial-close past a P&L fail).
  if (businessWeekPnl != null && Math.abs(settlementSumForWeek - businessWeekPnl) > CLOSE_INVARIANT_EPS) {
    allBlockers.push({
      code: "SETTLEMENT_PNL_MISMATCH",
      severity: "block",
      week,
      persisted: settlementSumForWeek,
      expected: businessWeekPnl,
      delta: settlementSumForWeek - businessWeekPnl,
      message: "Week settlement composition (statements) does not tie to engine week P&L",
    });
    return {
      organizationId: orgId,
      weekKey: week,
      closed: false,
      driversClosed: 0,
      driversBlocked: periodRows.length,
      blockers: allBlockers,
      perDriver: periodRows.map((p) => ({
        driverId: String(p.driver_id),
        closed: false,
        blockers: allBlockers,
      })),
    };
  } else if (businessWeekPnl == null) {
    allBlockers.push({
      code: "BUSINESS_WEEK_PNL_UNAVAILABLE",
      severity: "warn",
      week,
      persisted: settlementSumForWeek,
      expected: 0,
      delta: settlementSumForWeek,
      message: "Engine week P&L unavailable for settlement tie-out",
    });
  }

  const closeDriftBatch: Array<{
    driverId: string;
    drifts: StatementEngineDrift[];
    statementVersion: number | null;
  }> = [];
  /** H-2: collect freezes then apply in one RPC — never leave a half-closed week. */
  const freezeBatch: Array<{
    id: string;
    driverId: string;
    closeHash: string;
    metadata: Record<string, unknown>;
    closedAt: string;
  }> = [];

  for (const period of periodRows) {
    const driverId = String(period.driver_id);
    const meta = (period.metadata as Record<string, unknown> | null) || null;
    const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
    const frozen = periodIsFrozen(period as Record<string, unknown>);

    const statements = statementsByDriver.get(driverId) ?? [];
    const pendingDrafts = hasPendingRestatementDrafts(statements);

    if (frozen && !pendingDrafts) {
      // Idempotent: already frozen with no restatement drafts — skip.
      perDriver.push({
        driverId,
        closed: true,
        closeHash: String(period.source_event_hash || fc.closeHash || "") || undefined,
        blockers: [],
      });
      continue;
    }

    const acceptRestatementDrafts = frozen && pendingDrafts;
    const byKind = new Map<string, WeekStatement>(statements.map((s) => [s.kind, s]));
    const closeReason = acceptRestatementDrafts
      ? (reason.startsWith("restatement:") ? reason : `restatement:${reason}`)
      : reason;

    let engineBlockers: CloseBlocker[] = [];
    try {
      const engineDrifts = await compareDriverWeekStatementsToEngines({
        organizationId: orgId,
        driverId,
        weekKey: week,
        statements,
      });
      if (engineDrifts.length) {
        closeDriftBatch.push({
          driverId,
          drifts: engineDrifts,
          statementVersion: statements[0]?.version ?? null,
        });
        engineBlockers = engineDriftsToCloseBlockers(engineDrifts, {
          driverId,
          week,
        }) as CloseBlocker[];
      }
    } catch (e) {
      console.warn("[week_close] engine compare failed (non-fatal)", driverId, week, e);
    }

    let tollEventLedger: {
      orphanCount: number;
      orphanAmountMajor: number;
      eventSpendMajor: number;
      ledgerSpendMajor: number;
    } | null = null;
    try {
      const sum = await summarizeTollUsageOrphansForWeek({
        periodAnchor: week,
        driverId,
      });
      tollEventLedger = {
        orphanCount: sum.orphanCount,
        orphanAmountMajor: sum.orphanAmountMajor,
        eventSpendMajor: sum.eventSpendMajor,
        ledgerSpendMajor: sum.ledgerSpendMajor,
        missingEventCount: sum.missingEventCount,
        missingEventAmountMajor: sum.missingEventAmountMajor,
        ineligibleEventCount: sum.ineligibleEventCount,
        ineligibleEventAmountMajor: sum.ineligibleEventAmountMajor,
        amountMismatchCount: sum.amountMismatchCount,
        amountMismatchAmountMajor: sum.amountMismatchAmountMajor,
      };
      if (
        sum.orphanCount > 0 ||
        sum.ineligibleEventCount > 0 ||
        sum.amountMismatchCount > 0 ||
        Math.abs(sum.eventSpendMajor - sum.ledgerSpendMajor) > CLOSE_INVARIANT_EPS
      ) {
        closeDriftBatch.push({
          driverId,
          drifts: [
            {
              kind: "toll",
              field: "orphan_event_spend",
              statementMinor: Math.round(sum.eventSpendMajor * 100),
              engineMinor: Math.round(sum.ledgerSpendMajor * 100),
              deltaMinor: Math.round(
                (sum.orphanAmountMajor || sum.eventSpendMajor - sum.ledgerSpendMajor) * 100,
              ),
            },
          ],
          statementVersion: statements[0]?.version ?? null,
        });
      }
    } catch (e) {
      console.warn("[week_close] toll orphan summarize failed (non-fatal)", driverId, week, e);
    }

    const blockers = checkCloseInvariants({
      period: period as ClosePeriodRow,
      fuelStatement: fuelFromStatement(byKind.get("fuel"), acceptRestatementDrafts),
      tollStatement: tollFromStatement(byKind.get("toll"), acceptRestatementDrafts),
      earningsStatement: earningsFromStatement(byKind.get("earnings"), acceptRestatementDrafts),
      cashSourceMismatch: Number(
        (meta as { financeCore?: { cashSourceMismatch?: number } } | null)
          ?.financeCore?.cashSourceMismatch,
      ) || 0,
      skipSettlementDeskClear: acceptRestatementDrafts,
      engineDrifts: engineBlockers,
      tollEventLedger,
      tollUnknownPmCount: Number(
        (meta as { financeCore?: { tollUnknownPmCount?: number } } | null)
          ?.financeCore?.tollUnknownPmCount,
      ) || 0,
      tollUnknownPmAmount: Number(
        (meta as { financeCore?: { tollUnknownPmAmount?: number } } | null)
          ?.financeCore?.tollUnknownPmAmount,
      ) || 0,
      // H-3: P&L handled once above — not per driver.
    });

    // M-2: refuse close when active fuel_* events lack account keys.
    try {
      const { data: fuelEv } = await sb()
        .from("financial_events")
        .select("id, debit_account_key, credit_account_key, reverses_event_id, reversed_at")
        .eq("driver_id", driverId)
        .eq("period_anchor", week)
        .like("event_type", "fuel_%");
      const reversed = new Set(
        (fuelEv || []).filter((e) => e.reverses_event_id).map((e) => String(e.reverses_event_id)),
      );
      const missing = (fuelEv || []).filter(
        (e) =>
          !e.reverses_event_id &&
          !e.reversed_at &&
          !reversed.has(String(e.id)) &&
          (!e.debit_account_key || !e.credit_account_key),
      );
      if (missing.length > 0) {
        blockers.push({
          code: "FUEL_EVENT_MISSING_ACCOUNTS",
          severity: "block",
          driverId,
          week,
          persisted: missing.length,
          expected: 0,
          delta: missing.length,
          message: `${missing.length} active fuel_* event(s) missing debit/credit account keys`,
        });
      }
    } catch {
      /* non-fatal — finance-recon still catches */
    }

    if (!canCloseWeek(blockers)) {
      allBlockers.push(...blockers);
      perDriver.push({ driverId, closed: false, blockers });
      continue;
    }

    // Ties — sign it. Build H-4 close hash over the complete row + source ids.
    const sourceRowIds = statements.flatMap((s) => s.sourceRowIds);
    const closeHash = await buildCloseHash(
      buildPeriodCloseHashPayload({
        row: closeHashRowFrom(period as Record<string, unknown>),
        sourceRowIds,
        engineVersion: WEEK_STATEMENT_ENGINE_VERSION,
      }),
    );

    await closeWeekStatements(orgId, driverId, week, actorId, closeReason);

    const nextMeta = markPeriodFrozen(period as { metadata?: Record<string, unknown> }, {
      actorId,
      reason: closeReason,
      closeHash,
      sourceRowIds,
      engineVersion: WEEK_STATEMENT_ENGINE_VERSION,
    });

    freezeBatch.push({
      id: String(period.id),
      driverId,
      closeHash,
      metadata: nextMeta,
      closedAt: new Date().toISOString(),
    });
    perDriver.push({ driverId, closed: true, closeHash, blockers: [] });
  }

  if (freezeBatch.length > 0) {
    const { data: frozenCount, error: freezeErr } = await sb().rpc("freeze_settlement_periods_batch", {
      p_rows: freezeBatch.map((f) => ({
        id: f.id,
        close_hash: f.closeHash,
        metadata: f.metadata,
        closed_at: f.closedAt,
      })),
    });
    if (freezeErr) {
      // N-11: statements sealed, calendar freeze not applied — retryFreezeWeek recovers.
      throw new WeekCloseError(
        "ATOMIC_FREEZE_FAILED",
        `Statements sealed for ${freezeBatch.length} driver(s) but calendar freeze did not apply — use Retry freeze`,
        409,
        {
          driversSealed: freezeBatch.length,
          driverIds: freezeBatch.map((f) => f.driverId),
          freezeError: freezeErr.message,
        },
      );
    }
    if (Number(frozenCount) !== freezeBatch.length) {
      console.warn(
        "[week_close] freeze batch count mismatch",
        frozenCount,
        freezeBatch.length,
      );
    }
  }

  // Flush recon drifts after the driver loop (P-2).
  for (const row of closeDriftBatch) {
    try {
      await upsertFinanceReconDrifts({
        organizationId: orgId,
        driverId: row.driverId,
        weekKey: week,
        source: "close",
        drifts: row.drifts,
        statementVersion: row.statementVersion,
      });
    } catch (e) {
      console.warn("[week_close] close drift upsert failed", row.driverId, e);
    }
  }

  const driversClosed = perDriver.filter((d) => d.closed).length;
  const driversBlocked = perDriver.length - driversClosed;

  return {
    organizationId: orgId,
    weekKey: week,
    closed: driversBlocked === 0 && perDriver.length > 0,
    driversClosed,
    driversBlocked,
    blockers: allBlockers,
    perDriver,
  };
}

/**
 * N-11: apply calendar freeze only for drivers whose statements are already sealed
 * but periods are not frozen (recovery after ATOMIC_FREEZE_FAILED). Idempotent.
 */
export async function retryFreezeWeek(
  orgId: string,
  weekKey: string,
  actorId: string,
  reason: string,
): Promise<CloseWeekResult> {
  const week = String(weekKey).slice(0, 10);
  const closeReason = String(reason || "").trim() || "Retry freeze after ATOMIC_FREEZE_FAILED";

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const periodRows = periods ?? [];
  const statementsByDriver = await getLatestWeekStatementsForOrgWeek(orgId, week);
  const freezeBatch: Array<{
    id: string;
    driverId: string;
    closeHash: string;
    metadata: Record<string, unknown>;
    closedAt: string;
  }> = [];
  const perDriver: DriverCloseResult[] = [];

  for (const period of periodRows) {
    const driverId = String(period.driver_id);
    const meta = (period.metadata as Record<string, unknown> | null) || null;
    const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
    const frozen = periodIsFrozen(period as Record<string, unknown>);
    const statements = statementsByDriver.get(driverId) ?? [];

    if (frozen) {
      perDriver.push({
        driverId,
        closed: true,
        closeHash: String(period.source_event_hash || fc.closeHash || "") || undefined,
        blockers: [],
      });
      continue;
    }

    const closedLanes = statements.filter((s) => s.status === "closed");
    if (closedLanes.length === 0) {
      perDriver.push({
        driverId,
        closed: false,
        blockers: [{
          code: "RETRY_FREEZE_NO_STATEMENTS",
          severity: "block",
          driverId,
          week,
          persisted: 0,
          expected: 3,
          delta: -3,
          message: "No sealed statements — run Close week first, not Retry freeze",
        }],
      });
      continue;
    }

    const sourceRowIds = statements.flatMap((s) => s.sourceRowIds);
    const existingHash = String(period.source_event_hash || fc.closeHash || "").trim();
    const closeHash = existingHash || await buildCloseHash(
      buildPeriodCloseHashPayload({
        row: closeHashRowFrom(period as Record<string, unknown>),
        sourceRowIds,
        engineVersion: WEEK_STATEMENT_ENGINE_VERSION,
      }),
    );

    const nextMeta = markPeriodFrozen(period as { metadata?: Record<string, unknown> }, {
      actorId,
      reason: closeReason,
      closeHash,
      sourceRowIds,
      engineVersion: WEEK_STATEMENT_ENGINE_VERSION,
    });

    freezeBatch.push({
      id: String(period.id),
      driverId,
      closeHash,
      metadata: nextMeta,
      closedAt: new Date().toISOString(),
    });
    perDriver.push({ driverId, closed: true, closeHash, blockers: [] });
  }

  if (freezeBatch.length === 0) {
    const blocked = perDriver.filter((d) => !d.closed).length;
    return {
      organizationId: orgId,
      weekKey: week,
      closed: blocked === 0 && perDriver.length > 0,
      driversClosed: perDriver.filter((d) => d.closed).length,
      driversBlocked: blocked,
      blockers: perDriver.flatMap((d) => d.blockers),
      perDriver,
    };
  }

  const { data: frozenCount, error: freezeErr } = await sb().rpc("freeze_settlement_periods_batch", {
    p_rows: freezeBatch.map((f) => ({
      id: f.id,
      close_hash: f.closeHash,
      metadata: f.metadata,
      closed_at: f.closedAt,
    })),
  });
  if (freezeErr) {
    throw new WeekCloseError(
      "ATOMIC_FREEZE_FAILED",
      `Retry freeze failed: ${freezeErr.message}`,
      409,
      { driversSealed: freezeBatch.length, freezeError: freezeErr.message },
    );
  }
  if (Number(frozenCount) !== freezeBatch.length) {
    console.warn("[week_close] retry freeze count mismatch", frozenCount, freezeBatch.length);
  }

  const driversClosed = perDriver.filter((d) => d.closed).length;
  const driversBlocked = perDriver.length - driversClosed;
  return {
    organizationId: orgId,
    weekKey: week,
    closed: driversBlocked === 0 && perDriver.length > 0,
    driversClosed,
    driversBlocked,
    blockers: perDriver.flatMap((d) => d.blockers),
    perDriver,
  };
}

export type ReopenWeekResult = {
  organizationId: string;
  weekKey: string;
  reopened: boolean;
  driversReopened: number;
  driversSkipped: number;
  settlementRiskDrivers: Array<{
    driverId: string;
    settlementPaid: number;
    settlementAmount: number;
  }>;
};

/**
 * Admin calendar reopen: clear period freeze for every driver in the org-week.
 * Does not reopen fuel recon or rewrite week_statements. Requires
 * acknowledgeSettlementRisk when any driver has settlement_paid moved.
 */
export async function reopenWeek(
  orgId: string,
  weekKey: string,
  actorId: string,
  reason: string,
  acknowledgeSettlementRisk = false,
): Promise<ReopenWeekResult> {
  const week = String(weekKey).slice(0, 10);
  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) {
    throw new WeekCloseError("REASON_REQUIRED", "A reopen reason is required", 400);
  }

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const periodRows = periods ?? [];
  const settlementRiskDrivers: ReopenWeekResult["settlementRiskDrivers"] = [];
  const frozenRows: typeof periodRows = [];

  for (const period of periodRows) {
    if (!periodIsFrozen(period as Record<string, unknown>)) continue;
    frozenRows.push(period);
    const risk = settlementRiskForPeriod(period as Record<string, unknown>);
    if (risk.risk) {
      settlementRiskDrivers.push({
        driverId: String(period.driver_id),
        settlementPaid: risk.settlementPaid,
        settlementAmount: risk.settlementAmount,
      });
    }
  }

  if (frozenRows.length === 0) {
    return {
      organizationId: orgId,
      weekKey: week,
      reopened: true,
      driversReopened: 0,
      driversSkipped: periodRows.length,
      settlementRiskDrivers: [],
    };
  }

  if (settlementRiskDrivers.length > 0 && !acknowledgeSettlementRisk) {
    throw new WeekCloseError(
      "SETTLEMENT_RISK",
      "This week has settlement money already moved. Confirm acknowledgeSettlementRisk to reopen.",
      409,
      { settlementRiskDrivers },
    );
  }

  const now = new Date().toISOString();
  let driversReopened = 0;

  for (const period of frozenRows) {
    const nextMeta = clearPeriodFreeze(period as { metadata?: Record<string, unknown> }, {
      actorId,
      reason: trimmedReason,
      reopenedAt: now,
    });

    const { error: updErr } = await sb()
      .from("driver_financial_periods")
      .update({
        status: "reopened",
        closed_at: null,
        reopened_at: now,
        // Column is NOT NULL DEFAULT '' — never write null.
        source_event_hash: "",
        metadata: nextMeta,
      })
      .eq("id", period.id);
    if (updErr) throw new Error(updErr.message);
    driversReopened += 1;
  }

  return {
    organizationId: orgId,
    weekKey: week,
    reopened: true,
    driversReopened,
    driversSkipped: periodRows.length - driversReopened,
    settlementRiskDrivers,
  };
}
