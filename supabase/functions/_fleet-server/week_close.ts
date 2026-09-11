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
  assertPeriodEndedForReconciliation,
} from "./settlement_period_freeze.ts";
import { SettlementCommandError } from "./settlement_commands.ts";
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
import {
  summarizeTollUsageOrphansByDriverForWeek,
  type TollUsageIntegritySummary,
} from "./toll_financial_reset.ts";
import { engineDriftsToCloseBlockers } from "../../../packages/finance-core/src/statementEngineCompare.ts";
import type { StatementEngineDrift } from "../../../packages/finance-core/src/statementEngineCompare.ts";
import {
  buildCloseHash,
  buildPeriodCloseHashPayload,
  storedCloseHashFromPeriod,
} from "../../../packages/finance-core/src/closeHash.ts";
import {
  checkCloseInvariants,
  canCloseWeek,
  CLOSE_INVARIANT_EPS,
  isCashSourceAckValid,
  type CashSourceAck,
  type CloseBlocker,
  type CloseEarningsStatement,
  type CloseFuelStatement,
  type ClosePeriodRow,
  type CloseTollStatement,
} from "../../../packages/finance-core/src/closeInvariants.ts";
import { tollPeriodDisagreesWithSeal } from "../../../packages/finance-core/src/tollPeriodSealDrift.ts";
import { stampCloseInvariantSnapshotOnMeta } from "../../../packages/finance-core/src/periodSignedSnapshot.ts";
import type { WeekStatement } from "../../../packages/finance-core/src/weekStatement.ts";
import {
  accumulateWeekDirectory,
  cashAllSettled,
  selectFullyFrozenWeeks,
  selectOpenWeeks,
  type OpenWeekSummary,
} from "../../../packages/finance-core/src/weekCloseDirectory.ts";
import { closeWeekLaneForceOpts, resolveCloseLaneForceOpts } from "./week_close_force_opts.ts";
import type { CloseLaneForceOpts, CloseWeekOpts, PrepareWeekCloseOpts } from "./week_close_force_opts.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import { round2 } from "../../../packages/finance-core/src/money.ts";
import {
  CUSTODY_ERROR_CODES,
  CUSTODY_TARGET_HORIZON_WEEKS,
  PRIOR_CLOSE_HASH_CHANGED,
  clearCustodyTransferMarks,
  custodyCarryAlreadyLanded,
  custodyTargetWeekCandidates,
  mergeOpeningCashCustody,
  openingCustodyAfterReverse,
  pickFirstOpenCustodyTargetFromMap,
  priorCloseHashChanged,
  readCustodyTransferMarks,
  residualCustodyHeld,
} from "../../../packages/finance-core/src/custodyCarry.ts";
import {
  releaseWeekCloseLock,
  tryClaimWeekCloseLock,
} from "./week_close_lock.ts";
import { persistPeriodRowWithVersion } from "./period_persist.ts";

export type { CloseLaneForceOpts, CloseWeekOpts, PrepareWeekCloseOpts } from "./week_close_force_opts.ts";
export { closeWeekLaneForceOpts, resolveCloseLaneForceOpts } from "./week_close_force_opts.ts";

type CustodyTargetRow = {
  id: string;
  metadata: Record<string, unknown> | null;
  organization_id?: string | null;
  driver_id?: string;
  period_anchor?: string;
  status?: string | null;
  settlement_status?: string | null;
};

/**
 * N-2 / P-6: first non-frozen week after `afterWeekKey` (missing row = open stub).
 * One ranged query + in-memory Monday walk (not 52 sequential maybeSingle).
 */
async function findFirstOpenCustodyTarget(
  driverId: string,
  afterWeekKey: string,
  preferredTargetWeek?: string | null,
): Promise<{ targetWeek: string; existingRow: CustodyTargetRow | null } | null> {
  const preferred = String(preferredTargetWeek || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(preferred)) {
    const { data: prefRow, error: prefErr } = await sb()
      .from("driver_financial_periods")
      .select("id, metadata, organization_id, driver_id, period_anchor, status, settlement_status, closed_at")
      .eq("driver_id", driverId)
      .eq("period_anchor", preferred)
      .maybeSingle();
    if (prefErr) throw new Error(prefErr.message);
    if (!prefRow?.id) {
      return { targetWeek: preferred, existingRow: null };
    }
    if (
      !periodIsFrozen({
        metadata: prefRow.metadata,
        settlement_status: prefRow.settlement_status,
        status: prefRow.status,
        closed_at: prefRow.closed_at,
      } as Record<string, unknown>)
    ) {
      return { targetWeek: preferred, existingRow: prefRow as CustodyTargetRow };
    }
    // Preferred became frozen — fall through to ranged walk.
  }

  const candidates = custodyTargetWeekCandidates(afterWeekKey);
  const horizonEnd = candidates[candidates.length - 1];
  const { data: rows, error } = await sb()
    .from("driver_financial_periods")
    .select("id, metadata, organization_id, driver_id, period_anchor, status, settlement_status, closed_at")
    .eq("driver_id", driverId)
    .gt("period_anchor", afterWeekKey)
    .lte("period_anchor", horizonEnd)
    .order("period_anchor", { ascending: true })
    .limit(CUSTODY_TARGET_HORIZON_WEEKS);
  if (error) throw new Error(error.message);

  const byAnchor = new Map<string, CustodyTargetRow>();
  const frozenByAnchor = new Map<string, boolean>();
  for (const row of rows || []) {
    const anchor = String(row.period_anchor || "").slice(0, 10);
    if (!anchor) continue;
    byAnchor.set(anchor, row as CustodyTargetRow);
    frozenByAnchor.set(
      anchor,
      periodIsFrozen({
        metadata: row.metadata,
        settlement_status: row.settlement_status,
        status: row.status,
        closed_at: row.closed_at,
      } as Record<string, unknown>),
    );
  }

  const picked = pickFirstOpenCustodyTargetFromMap({
    afterWeekKey,
    frozenByAnchor,
  });
  if (!picked) return null;
  if (!picked.exists) {
    return { targetWeek: picked.targetWeek, existingRow: null };
  }
  return {
    targetWeek: picked.targetWeek,
    existingRow: byAnchor.get(picked.targetWeek) || null,
  };
}

/**
 * Phase 2 / Pass 4–6: after calendar freeze (or recovery), transfer residual
 * cash_still_held onto the first non-frozen later week as openingCashCustody.
 */
async function carryForwardCashCustodyAfterFreeze(opts: {
  orgId: string;
  weekKey: string;
  freezeBatch: Array<{
    id: string;
    driverId: string;
    metadata: Record<string, unknown>;
  }>;
  periodByDriver: Map<string, Record<string, unknown>>;
  /** P-6: reuse targets already resolved in close preflight. */
  resolvedTargets?: Map<string, string>;
}): Promise<{ carried: number; totalAmount: number }> {
  let carried = 0;
  let totalAmount = 0;

  for (const f of opts.freezeBatch) {
    const period = opts.periodByDriver.get(f.driverId);
    if (!period) continue;
    const held = residualCustodyHeld(Number(period.cash_still_held) || 0, CLOSE_INVARIANT_EPS);
    if (held <= CLOSE_INVARIANT_EPS) continue;

    const srcFc = ((f.metadata.financeCore || {}) as Record<string, unknown>);
    // Idempotent skip only when marks exist AND successor still shows opening custody.
    if (srcFc.custodyTransferredTo) {
      const marks = readCustodyTransferMarks(srcFc);
      const opening = await loadSuccessorOpeningCustody(f.driverId, marks.transferredTo!);
      if (custodyCarryAlreadyLanded(srcFc, opening, CLOSE_INVARIANT_EPS)) continue;
      // Fall through to heal onto first open target (may differ from stale mark).
    }

    const preferred = opts.resolvedTargets?.get(f.driverId) || null;
    const target = await findFirstOpenCustodyTarget(f.driverId, opts.weekKey, preferred);
    if (!target) {
      throw new WeekCloseError(
        CUSTODY_ERROR_CODES.NO_OPEN_TARGET,
        `No open week to carry $${held.toFixed(2)} custody for driver after ${opts.weekKey} — reopen a later week or leave an open period`,
        409,
        {
          driverId: f.driverId,
          weekKey: opts.weekKey,
          cashStillHeld: held,
        },
      );
    }

    const { targetWeek, existingRow } = target;
    const orgId =
      String(period.organization_id || existingRow?.organization_id || opts.orgId || "").trim() ||
      opts.orgId;

    if (existingRow?.id) {
      const nextMeta = { ...((existingRow.metadata as Record<string, unknown>) || {}) };
      const nextFc = { ...((nextMeta.financeCore as Record<string, unknown>) || {}) };
      nextMeta.financeCore = mergeOpeningCashCustody(nextFc, held, opts.weekKey);
      await persistPeriodRowWithVersion(f.driverId, targetWeek, {
        metadata: nextMeta,
        updated_at: new Date().toISOString(),
      });
    } else {
      await persistPeriodRowWithVersion(f.driverId, targetWeek, {
        organization_id: orgId,
        period_end: periodEndForAnchor(targetWeek),
        status: "open",
        settlement_status: "pending",
        cash_still_held: held,
        cash_still_held_minor: Math.round(held * 100),
        metadata: {
          financeCore: mergeOpeningCashCustody({}, held, opts.weekKey),
        },
        source_event_hash: "",
      });
    }

    const srcMeta = {
      ...f.metadata,
      financeCore: {
        ...srcFc,
        custodyTransferredTo: targetWeek,
        custodyTransferredAmount: held,
      },
    };
    await persistPeriodRowWithVersion(
      f.driverId,
      opts.weekKey,
      {
        metadata: srcMeta,
        updated_at: new Date().toISOString(),
      },
      3,
      { allowFrozen: true },
    );

    try {
      const { rebuildOneDriverPeriod } = await import("./driver_financial_periods.ts");
      await rebuildOneDriverPeriod(f.driverId, targetWeek);
    } catch (e) {
      console.warn("[week_close] next week rebuild after custody carry failed", f.driverId, e);
    }

    carried += 1;
    totalAmount = round2(totalAmount + held);
  }

  return { carried, totalAmount };
}

async function loadSuccessorOpeningCustody(
  driverId: string,
  successorWeek: string,
): Promise<number> {
  const { data: succ } = await sb()
    .from("driver_financial_periods")
    .select("metadata")
    .eq("driver_id", driverId)
    .eq("period_anchor", successorWeek)
    .maybeSingle();
  const succFc = ((succ?.metadata as Record<string, unknown> | null)?.financeCore ||
    {}) as Record<string, unknown>;
  return round2(Math.max(0, Number(succFc.openingCashCustody) || 0));
}

/**
 * N-3 preflight (read-only): custody carry readiness before freeze.
 * - ok + targetWeek: residual needs carry and an open week was found (reuse in carry)
 * - ok + no targetWeek: no residual / already landed
 * - blocked: residual with no open target in horizon
 */
async function custodyCarryPreflight(
  driverId: string,
  weekKey: string,
  period: Record<string, unknown>,
  metadata: Record<string, unknown> | null,
): Promise<
  | { ok: true; targetWeek?: string }
  | { ok: false; held: number }
> {
  const held = residualCustodyHeld(Number(period.cash_still_held) || 0, CLOSE_INVARIANT_EPS);
  if (held <= CLOSE_INVARIANT_EPS) return { ok: true };
  const fc = ((metadata?.financeCore || {}) as Record<string, unknown>);
  if (fc.custodyTransferredTo) {
    const marks = readCustodyTransferMarks(fc);
    const opening = await loadSuccessorOpeningCustody(driverId, marks.transferredTo!);
    if (custodyCarryAlreadyLanded(fc, opening, CLOSE_INVARIANT_EPS)) return { ok: true };
  }
  const target = await findFirstOpenCustodyTarget(driverId, weekKey);
  if (!target) return { ok: false, held };
  return { ok: true, targetWeek: target.targetWeek };
}

function custodyNoOpenTargetBlocker(
  driverId: string,
  week: string,
  held: number,
): CloseBlocker {
  return {
    code: CUSTODY_ERROR_CODES.NO_OPEN_TARGET,
    severity: "block",
    driverId,
    week,
    persisted: held,
    expected: 0,
    delta: held,
    message: `No open week to park $${held.toFixed(2)} passenger cash after ${week} — reopen a later week or leave one open`,
  };
}

/**
 * Pass 6: run custody carry for every driver on the week that still needs it
 * (just-frozen batch and/or already-frozen stranded rows).
 */
async function runCustodyCarryForWeek(opts: {
  orgId: string;
  weekKey: string;
  periodRows: Array<Record<string, unknown>>;
  resolvedTargets?: Map<string, string>;
}): Promise<{ carried: number; totalAmount: number }> {
  const periodByDriver = new Map<string, Record<string, unknown>>();
  const freezeBatch: Array<{
    id: string;
    driverId: string;
    metadata: Record<string, unknown>;
  }> = [];

  for (const p of opts.periodRows) {
    const driverId = String(p.driver_id || "");
    if (!driverId || !p.id) continue;
    // Only carry from calendar-frozen sources — never from an open week that failed close.
    if (!periodIsFrozen(p)) continue;
    periodByDriver.set(driverId, p);
    const held = residualCustodyHeld(Number(p.cash_still_held) || 0, CLOSE_INVARIANT_EPS);
    if (held <= CLOSE_INVARIANT_EPS) continue;
    const meta = { ...((p.metadata as Record<string, unknown>) || {}) };
    freezeBatch.push({
      id: String(p.id),
      driverId,
      metadata: meta,
    });
  }

  if (freezeBatch.length === 0) return { carried: 0, totalAmount: 0 };
  return carryForwardCashCustodyAfterFreeze({
    orgId: opts.orgId,
    weekKey: opts.weekKey,
    freezeBatch,
    periodByDriver,
    resolvedTargets: opts.resolvedTargets,
  });
}

/**
 * N-1: pull carried custody back from the successor before unfreezing source week N.
 * Returns metadata with transfer marks cleared (caller merges into clearPeriodFreeze result).
 */
async function reverseCustodyCarryOnReopen(opts: {
  driverId: string;
  weekKey: string;
  metadata: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const fc = { ...((opts.metadata.financeCore as Record<string, unknown>) || {}) };
  const marks = readCustodyTransferMarks(fc);
  if (!marks.transferredTo || marks.transferredAmount <= CLOSE_INVARIANT_EPS) {
    return opts.metadata;
  }

  const successorWeek = marks.transferredTo;
  const { data: succ, error } = await sb()
    .from("driver_financial_periods")
    .select("id, metadata, status, settlement_status, closed_at")
    .eq("driver_id", opts.driverId)
    .eq("period_anchor", successorWeek)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (succ?.id) {
    if (
      periodIsFrozen({
        metadata: succ.metadata,
        settlement_status: succ.settlement_status,
        status: succ.status,
        closed_at: succ.closed_at,
      } as Record<string, unknown>)
    ) {
      throw new WeekCloseError(
        CUSTODY_ERROR_CODES.SUCCESSOR_FROZEN,
        `Reopen ${opts.weekKey} would double-count custody still parked on closed week ${successorWeek} — reopen ${successorWeek} first`,
        409,
        {
          driverId: opts.driverId,
          weekKey: opts.weekKey,
          successorWeek,
          amount: marks.transferredAmount,
        },
      );
    }

    const succMeta = { ...((succ.metadata as Record<string, unknown>) || {}) };
    const succFc = { ...((succMeta.financeCore as Record<string, unknown>) || {}) };
    const nextOpening = openingCustodyAfterReverse(
      Number(succFc.openingCashCustody) || 0,
      marks.transferredAmount,
    );
    if (nextOpening > CLOSE_INVARIANT_EPS) {
      succFc.openingCashCustody = nextOpening;
    } else {
      delete succFc.openingCashCustody;
      delete succFc.custodyReceivedFrom;
    }
    succMeta.financeCore = succFc;
    await persistPeriodRowWithVersion(opts.driverId, successorWeek, {
      metadata: succMeta,
      updated_at: new Date().toISOString(),
    });

    try {
      const { rebuildOneDriverPeriod } = await import("./driver_financial_periods.ts");
      await rebuildOneDriverPeriod(opts.driverId, successorWeek);
    } catch (e) {
      console.warn("[week_close] successor rebuild after custody reverse failed", opts.driverId, e);
    }
  }

  return {
    ...opts.metadata,
    financeCore: clearCustodyTransferMarks(fc),
  };
}

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

/**
 * P-4: columns for close invariants, freeze, hash, reopen — not select("*").
 * metadata is required (financeCore freeze + cash ack).
 */
const PERIOD_CLOSE_SELECT = [
  "id",
  "driver_id",
  "organization_id",
  "period_anchor",
  "period_end",
  "status",
  "metadata",
  "source_event_hash",
  "close_hash",
  "cash_collected",
  "cash_returned",
  "cash_still_held",
  "cash_written_off",
  "settlement_paid",
  "settlement_amount",
  "settlement_status",
  "payout_net",
  "toll_spend",
  "toll_cash_spend",
  "toll_tag_spend",
  "toll_reimbursed",
  "toll_charged_to_driver",
  "toll_unmatched_count",
  "dispute_refund_matched",
  "dispute_refund_unmatched",
  "fuel_deduction",
  "fuel_fleet_share",
  "fuel_finalized",
  "driver_share",
  "fleet_share",
  "earnings_gross",
  "tips_paid_to_driver",
  "trip_count",
  "closed_at",
].join(", ");

function tollEventLedgerFromSummary(
  sum: TollUsageIntegritySummary | undefined | null,
): {
  orphanCount: number;
  orphanAmountMajor: number;
  eventSpendMajor: number;
  ledgerSpendMajor: number;
  missingEventCount: number;
  missingEventAmountMajor: number;
  ineligibleEventCount: number;
  ineligibleEventAmountMajor: number;
  amountMismatchCount: number;
  amountMismatchAmountMajor: number;
} | null {
  if (!sum) return null;
  return {
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
  // R-2: do not read period.signed_at — column is never written; freeze is metadata + status/closed_at.
  return isPeriodFrozen({
    metadata: meta,
    settlementStatus: period.settlement_status ? String(period.settlement_status) : null,
    signedAt: fc.signedAt ? String(fc.signedAt) : null,
    status: period.status != null ? String(period.status) : null,
    closedAt: period.closed_at != null ? String(period.closed_at) : null,
  });
}

function settlementRiskForPeriod(period: Record<string, unknown>): {
  risk: boolean;
  settlementPaid: number;
  settlementAmount: number;
  cashCollected: number;
  cashWrittenOff: number;
} {
  // M-1: reopen risk includes payouts, returns, write-offs, and collections
  // (collected-without-returned is risk — do not AND with returned).
  const settlementPaid = Number(period.settlement_paid) || 0;
  const settlementAmount = Number(period.settlement_amount) || 0;
  const cashCollected = Number(period.cash_collected) || 0;
  const cashReturned = Number(period.cash_returned) || 0;
  const cashWrittenOff = Number(period.cash_written_off) || 0;
  const risk =
    Math.abs(settlementPaid) > CLOSE_INVARIANT_EPS ||
    Math.abs(cashReturned) > CLOSE_INVARIANT_EPS ||
    Math.abs(cashWrittenOff) > CLOSE_INVARIANT_EPS ||
    Math.abs(cashCollected) > CLOSE_INVARIANT_EPS;
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

export type WeekCloseCashSourceMismatch = {
  driverId: string;
  driverName?: string | null;
  weekKey: string;
  uberCash: number;
  uberTripCash: number;
  mismatch: number;
  ack?: CashSourceAck | null;
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
  /**
   * Drivers (unfrozen) whose period toll_* disagreed with the toll seal
   * immediately before seal→rebuild sync on prepare/close.
   */
  tollPeriodSealDriftCount?: number;
  /** Unfrozen drivers rebuilt after lane seal so Pass E stamps statement→period. */
  periodsRebuiltAfterSeal?: number;
  /** Draft restatement rows (status=draft AND supersedes set) for this week. */
  pendingRestatementCount?: number;
  /** Frozen drivers with settlement_paid moved — reopen needs risk ack. */
  settlementRiskDriverCount?: number;
  /** Drivers with settlement_status = settled. */
  driversSettled?: number;
  /** True when every driver-period for the week is cash-settled. */
  cashAllSettled?: boolean;
  /**
   * Drivers with |uberCash − uberTripCash| > ε (or a stored ack).
   * Statement cash = uberCash; trip rollup = uberTripCash.
   */
  cashSourceMismatches?: WeekCloseCashSourceMismatch[];
  /** Count of drivers with a still-valid cashSourceAck for this week. */
  cashSourceAckCount?: number;
  /** P-2: statement engine version used when this preview was built. */
  statementEngineVersion?: string;
};

type FinanceCoreCashSlice = {
  cashSourceMismatch: number;
  uberCash: number;
  uberTripCash: number;
  cashSourceAck: CashSourceAck | null;
};

function parseCashSourceAck(raw: unknown): CashSourceAck | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const reason = String(o.reason || "").trim();
  if (!reason) return null;
  const mismatchAtAck = Number(o.mismatchAtAck);
  if (!Number.isFinite(mismatchAtAck)) return null;
  return {
    at: String(o.at || ""),
    by: o.by != null ? String(o.by) : null,
    reason,
    uberCash: Number(o.uberCash) || 0,
    uberTripCash: Number(o.uberTripCash) || 0,
    mismatchAtAck,
  };
}

function readFinanceCoreCash(meta: Record<string, unknown> | null | undefined): FinanceCoreCashSlice {
  const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
  return {
    cashSourceMismatch: Number(fc.cashSourceMismatch) || 0,
    uberCash: Number(fc.uberCash) || 0,
    uberTripCash: Number(fc.uberTripCash) || 0,
    cashSourceAck: parseCashSourceAck(fc.cashSourceAck),
  };
}

function cashInvariantFields(meta: Record<string, unknown> | null | undefined) {
  const cash = readFinanceCoreCash(meta);
  return {
    cashSourceMismatch: cash.cashSourceMismatch,
    uberCash: cash.uberCash,
    uberTripCash: cash.uberTripCash,
    cashSourceAck: cash.cashSourceAck,
  };
}

/**
 * Close Program Pass 3/5 precondition: refresh fuel/toll/earnings from
 * independent seals while the week is open.
 */
async function ensureCloseLaneStatements(
  orgId: string,
  week: string,
  actorId?: string,
  opts?: CloseLaneForceOpts,
): Promise<{ didSeal: boolean }> {
  // H-6: one as_of for all three seals so statements describe one instant.
  const asOf = new Date().toISOString();

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

  let didSeal = false;
  const forceFuel = Boolean(opts?.forceFuelReseal);
  const forceToll = Boolean(opts?.forceTollReseal);
  const forceEarnings = Boolean(opts?.forceEarningsReseal);

  // Missing/draft → seal. Force flags → closed→closed reseal (engine drift).
  // Never pass allowRestatementDraft from Close sync (draft-over-closed blocked).
  if (fuelNeedsSeal || (anyOpenDriver && fuelLaneMissing) || forceFuel) {
    try {
      await sealFuelWeek({
        organizationId: orgId,
        weekKey: week,
        actorId,
        force: forceFuel,
        asOf,
      });
      didSeal = true;
    } catch (e) {
      console.warn("[week_close] fuel auto-seal failed (non-fatal)", week, e);
    }
  }

  if (
    tollNeedsSeal ||
    tollStaleZeroNa ||
    forceToll ||
    (anyOpenDriver && tollLaneMissing)
  ) {
    try {
      await sealTollWeek({
        organizationId: orgId,
        weekKey: week,
        actorId,
        force: Boolean(tollStaleZeroNa || forceToll),
        asOf,
      });
      didSeal = true;
    } catch (e) {
      console.warn("[week_close] toll auto-seal failed (non-fatal)", week, e);
    }
  }

  if (earningsNeedsSeal || (anyOpenDriver && earningsLaneMissing) || forceEarnings) {
    try {
      await sealEarningsWeek({
        organizationId: orgId,
        weekKey: week,
        actorId,
        force: forceEarnings,
        asOf,
      });
      didSeal = true;
    } catch (e) {
      console.warn("[week_close] earnings auto-seal failed (non-fatal)", week, e);
    }
  }

  return { didSeal };
}

/**
 * Cheap assess: do we need seal and/or period rebuild before preview?
 * One org-week statement batch — avoids write path when week is already healthy.
 */
async function assessCloseWeekSyncNeed(
  orgId: string,
  week: string,
): Promise<{
  needsSeal: boolean;
  needsForceTollReseal: boolean;
  periodDriftCount: number;
}> {
  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, fuel_deduction, fuel_fleet_share, toll_spend, toll_charged_to_driver, settlement_status, metadata",
    )
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const statementsByDriver = await getLatestWeekStatementsForOrgWeek(orgId, week);
  let needsSeal = false;
  let needsForceTollReseal = false;
  let periodDriftCount = 0;

  for (const p of periods ?? []) {
    const driverId = String(p.driver_id || "");
    if (!driverId) continue;
    if (periodIsFrozen(p as Record<string, unknown>)) continue;

    const statements = statementsByDriver.get(driverId) ?? [];
    const byKind = new Map(statements.map((s) => [s.kind, s]));
    const fuel = byKind.get("fuel");
    const toll = byKind.get("toll");
    const earnings = byKind.get("earnings");

    if (!fuel || fuel.status !== "closed") needsSeal = true;
    if (!toll || toll.status !== "closed") needsSeal = true;
    else if (String(toll.closeReason || "") === "zero_activity_na") {
      needsSeal = true;
      needsForceTollReseal = true;
    }
    if (!earnings || earnings.status !== "closed") needsSeal = true;

    let drifted = false;
    if (toll && (toll.status === "closed" || toll.status === "draft")) {
      if (
        tollPeriodDisagreesWithSeal(
          {
            tollSpend: Number(p.toll_spend) || 0,
            tollChargedToDriver: Number(p.toll_charged_to_driver) || 0,
          },
          {
            totalSpend: minorToMajor(toll.amountsMinor.totalSpend),
            chargedToDriver: minorToMajor(toll.amountsMinor.chargedToDriver),
          },
        )
      ) {
        drifted = true;
      }
    }
    if (fuel && fuel.status === "closed") {
      const sealDriver = minorToMajor(fuel.amountsMinor.driverShare);
      const sealFleet = minorToMajor(fuel.amountsMinor.companyShare);
      if (
        Math.abs((Number(p.fuel_deduction) || 0) - sealDriver) > CLOSE_INVARIANT_EPS ||
        Math.abs((Number(p.fuel_fleet_share) || 0) - sealFleet) > CLOSE_INVARIANT_EPS
      ) {
        drifted = true;
      }
    }
    if (drifted) periodDriftCount += 1;
  }

  return { needsSeal, needsForceTollReseal, periodDriftCount };
}

/**
 * After lane seal: rebuild unfrozen driver periods so Pass E stamps statement→period
 * before invariants. Counts pre-rebuild toll period↔seal drift for ops metrics.
 *
 * Contract: any path that publishes a closed week_statement for an open org-week
 * must rebuild open periods for that week (Fuel finalize, Toll seal, Close sync).
 */
async function syncOpenPeriodsToStatementsAfterSeal(
  orgId: string,
  week: string,
  opts?: { rebuildMode?: "all-open" | "drifted-only" | "skip" },
): Promise<{
  preRebuildTollDriftCount: number;
  rebuilt: number;
  failedDriverIds: string[];
}> {
  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, fuel_deduction, fuel_fleet_share, toll_spend, toll_charged_to_driver, toll_reimbursed, settlement_status, metadata",
    )
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const statementsByDriver = await getLatestWeekStatementsForOrgWeek(orgId, week);
  const openDriverIds: string[] = [];
  const driftedDriverIds: string[] = [];
  let preRebuildTollDriftCount = 0;

  for (const p of periods ?? []) {
    const driverId = String(p.driver_id || "");
    if (!driverId) continue;
    if (periodIsFrozen(p as Record<string, unknown>)) continue;
    openDriverIds.push(driverId);

    const statements = statementsByDriver.get(driverId) ?? [];
    let drifted = false;
    const toll = statements.find(
      (s) => s.kind === "toll" && (s.status === "closed" || s.status === "draft"),
    );
    if (toll) {
      const sealSpend = minorToMajor(toll.amountsMinor.totalSpend);
      const sealCharged = minorToMajor(toll.amountsMinor.chargedToDriver);
      if (
        tollPeriodDisagreesWithSeal(
          {
            tollSpend: Number(p.toll_spend) || 0,
            tollChargedToDriver: Number(p.toll_charged_to_driver) || 0,
          },
          { totalSpend: sealSpend, chargedToDriver: sealCharged },
        )
      ) {
        preRebuildTollDriftCount += 1;
        drifted = true;
      }
    }
    const fuel = statements.find((s) => s.kind === "fuel" && s.status === "closed");
    if (fuel) {
      const sealDriver = minorToMajor(fuel.amountsMinor.driverShare);
      const sealFleet = minorToMajor(fuel.amountsMinor.companyShare);
      if (
        Math.abs((Number(p.fuel_deduction) || 0) - sealDriver) > CLOSE_INVARIANT_EPS ||
        Math.abs((Number(p.fuel_fleet_share) || 0) - sealFleet) > CLOSE_INVARIANT_EPS
      ) {
        drifted = true;
      }
    }
    if (drifted) driftedDriverIds.push(driverId);
  }

  const mode = opts?.rebuildMode ?? "all-open";
  const toRebuild =
    mode === "skip" ? [] : mode === "drifted-only" ? driftedDriverIds : openDriverIds;

  const { rebuildPeriodsForAnchors } = await import("./driver_financial_periods.ts");
  const failedDriverIds: string[] = [];
  let rebuilt = 0;
  await mapPool(toRebuild, 4, async (driverId) => {
    try {
      await rebuildPeriodsForAnchors(driverId, [week]);
      rebuilt += 1;
    } catch (e) {
      failedDriverIds.push(driverId);
      console.warn("[week_close] period rebuild after seal failed", driverId, week, e);
    }
  });

  return { preRebuildTollDriftCount, rebuilt, failedDriverIds };
}

/** True when any open driver still has missing/draft/stale-zero toll seal. */
async function orgWeekNeedsForceTollReseal(orgId: string, week: string): Promise<boolean> {
  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("driver_id, settlement_status, metadata")
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  for (const p of periods ?? []) {
    const driverId = String(p.driver_id || "");
    if (!driverId) continue;
    if (periodIsFrozen(p as Record<string, unknown>)) continue;
    const statements = await getLatestWeekStatements(orgId, driverId, week);
    const toll = statements.find((s) => s.kind === "toll");
    if (!toll || toll.status !== "closed") return true;
    if (String(toll.closeReason || "") === "zero_activity_na") return true;
  }
  return false;
}

/**
 * H-1: Pure read preview — does NOT seal lanes or write recon drifts.
 * Use {@link prepareWeekClose} before close when lanes need sealing.
 */
export async function previewWeekClose(orgId: string, weekKey: string): Promise<WeekClosePreview> {
  const week = String(weekKey).slice(0, 10);

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select(PERIOD_CLOSE_SELECT)
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const rows = periods ?? [];
  const blockers: CloseBlocker[] = [];
  const weekBlockers: CloseBlocker[] = [];
  let driversReady = 0;
  let driversFrozen = 0;
  let driversSettled = 0;
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

  // P-3: one week-scoped toll orphan scan, indexed by driver.
  let orphansByDriver = new Map<string, TollUsageIntegritySummary>();
  try {
    orphansByDriver = await summarizeTollUsageOrphansByDriverForWeek(week);
  } catch (e) {
    console.warn("[week_close] toll orphan week summarize failed (non-fatal)", week, e);
  }

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
  const cashSourceMismatches: WeekCloseCashSourceMismatch[] = [];
  let cashSourceAckCount = 0;

  for (const period of rows) {
    const driverId = String(period.driver_id);
    const meta = (period.metadata as Record<string, unknown> | null) || null;
    const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
    const frozen = periodIsFrozen(period as Record<string, unknown>);
    const cash = readFinanceCoreCash(meta);
    if (Math.abs(cash.cashSourceMismatch) > CLOSE_INVARIANT_EPS || cash.cashSourceAck) {
      cashSourceMismatches.push({
        driverId,
        driverName:
          (period as { driver_name?: string | null }).driver_name != null
            ? String((period as { driver_name?: string | null }).driver_name)
            : null,
        weekKey: week,
        uberCash: cash.uberCash,
        uberTripCash: cash.uberTripCash,
        mismatch: cash.cashSourceMismatch,
        ack: cash.cashSourceAck,
      });
      if (isCashSourceAckValid(cash.cashSourceAck, cash.cashSourceMismatch)) {
        cashSourceAckCount += 1;
      }
    }

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

    if (String(period.settlement_status || "") === "settled") {
      driversSettled += 1;
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

    const tollEventLedger =
      !frozen || acceptRestatementDrafts
        ? tollEventLedgerFromSummary(orphansByDriver.get(driverId))
        : null;

    const driverBlockers = checkCloseInvariants({
      period: period as ClosePeriodRow,
      fuelStatement,
      tollStatement,
      earningsStatement: earningsFromStatement(byKind.get("earnings"), acceptRestatementDrafts),
      ...cashInvariantFields(meta),
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
    // N-3: custody target must exist before freeze — surface on preview.
    if (!frozen || acceptRestatementDrafts) {
      try {
        const preflight = await custodyCarryPreflight(
          driverId,
          week,
          period as Record<string, unknown>,
          meta,
        );
        if (!preflight.ok) {
          driverBlockers.push(custodyNoOpenTargetBlocker(driverId, week, preflight.held));
        }
      } catch (e) {
        console.warn("[week_close] custody preflight failed (non-fatal preview)", driverId, e);
      }
    }
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
    driversSettled,
    cashAllSettled: cashAllSettled({
      driversTotal: rows.length,
      driversSettled,
    }),
    cashSourceMismatches,
    cashSourceAckCount,
    statementEngineVersion: WEEK_STATEMENT_ENGINE_VERSION,
  };
}

export type ClosedWeekSummary = {
  weekKey: string;
  driversTotal: number;
  driversFrozen: number;
  closedAt: string | null;
  pendingRestatementCount: number;
};

export type { OpenWeekSummary };

const WEEK_RE_INTERNAL = /^\d{4}-\d{2}-\d{2}$/;

/** Page all org periods in a year window into week directory aggregates. */
async function loadYearWeekDirectory(
  orgId: string,
  opts?: { year?: number },
): Promise<ReturnType<typeof accumulateWeekDirectory>> {
  const year = opts?.year && Number.isFinite(opts.year) ? Math.trunc(opts.year) : undefined;
  const from = year != null ? `${year}-01-01` : undefined;
  const to = year != null ? `${year}-12-31` : undefined;
  const inputs: Array<{
    weekKey: string;
    frozen: boolean;
    settled: boolean;
    signedAt?: string | null;
  }> = [];

  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let q = sb()
      .from("driver_financial_periods")
      .select("period_anchor, metadata, settlement_status, status, closed_at")
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
      const period = row as Record<string, unknown>;
      const meta = (period.metadata as Record<string, unknown> | null) || null;
      const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
      const signedAt = fc.signedAt
        ? String(fc.signedAt)
        : row.closed_at
          ? String(row.closed_at)
          : null;
      inputs.push({
        weekKey,
        frozen: periodIsFrozen(period),
        settled: String(row.settlement_status || "") === "settled",
        signedAt,
      });
    }
    if (batch.length < pageSize) break;
  }
  return accumulateWeekDirectory(inputs);
}

/**
 * Year-scoped directory of fully closed weeks (every driver-period frozen).
 * Not the Restatements queue — weeks with no drafts still appear here.
 */
export async function listClosedWeeks(
  orgId: string,
  opts?: { year?: number },
): Promise<ClosedWeekSummary[]> {
  const year = opts?.year && Number.isFinite(opts.year) ? Math.trunc(opts.year) : undefined;
  const aggs = await loadYearWeekDirectory(orgId, opts);
  const frozen = selectFullyFrozenWeeks(aggs);

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

  return frozen.map((a) => ({
    weekKey: a.weekKey,
    driversTotal: a.driversTotal,
    driversFrozen: a.driversFrozen,
    closedAt: a.closedAt,
    pendingRestatementCount: draftCounts.get(a.weekKey) || 0,
  }));
}

/**
 * Year-scoped Open directory: weeks with activity that are not fully frozen.
 * Includes cash settled counts for dual-stamp (Settled × Signed) UX.
 */
export async function listOpenWeeks(
  orgId: string,
  opts?: { year?: number },
): Promise<OpenWeekSummary[]> {
  const aggs = await loadYearWeekDirectory(orgId, opts);
  return selectOpenWeeks(aggs);
}

/**
 * Week sync (product: silent when Close Week needs repair) — seals missing/draft
 * lanes, rebuilds drifted/open periods, persists recon drifts. Preview stays pure.
 * Slim: if lanes already closed and periods tie to seals, return preview only
 * (no rebuild / drift upsert — avoids Edge OOM on healthy Refresh).
 * Force opts (client hints / mass heal): closed→closed reseal for engine drift;
 * never draft-over-closed.
 */
export async function prepareWeekClose(
  orgId: string,
  weekKey: string,
  actorId: string,
  opts?: PrepareWeekCloseOpts,
): Promise<WeekClosePreview> {
  const week = String(weekKey).slice(0, 10);
  try {
    assertPeriodEndedForReconciliation(week);
  } catch (e) {
    if (e instanceof SettlementCommandError) {
      throw new WeekCloseError(e.code, e.message, e.status, e.details);
    }
    throw e;
  }

  // C-3: mutual exclusion — skip when caller (closeWeek) already holds the lock.
  const manageLock = !opts?.skipCloseLock;
  if (manageLock) {
    const claimed = await tryClaimWeekCloseLock(orgId, week, actorId);
    if (!claimed) {
      throw new WeekCloseError(
        "CLOSE_IN_PROGRESS",
        "Week close or sync already in progress for this week — retry shortly",
        409,
        { weekKey: week },
      );
    }
  }

  try {
    return await prepareWeekCloseBody(orgId, week, actorId, opts);
  } finally {
    if (manageLock) {
      await releaseWeekCloseLock(orgId, week, actorId);
    }
  }
}

/** Inner prepare body (lock managed by prepareWeekClose / closeWeek). */
async function prepareWeekCloseBody(
  orgId: string,
  week: string,
  actorId: string,
  opts?: PrepareWeekCloseOpts,
): Promise<WeekClosePreview> {
  const force = resolveCloseLaneForceOpts(opts);
  const anyForce = force.forceFuelReseal || force.forceTollReseal || force.forceEarningsReseal;

  const assess = await assessCloseWeekSyncNeed(orgId, week);
  if (
    !anyForce &&
    !assess.needsSeal &&
    !assess.needsForceTollReseal &&
    assess.periodDriftCount === 0
  ) {
    const preview = await previewWeekClose(orgId, week);
    preview.tollPeriodSealDriftCount = 0;
    preview.periodsRebuiltAfterSeal = 0;
    return preview;
  }

  let didSeal = false;
  if (anyForce || assess.needsSeal || assess.needsForceTollReseal) {
    const sealed = await ensureCloseLaneStatements(orgId, week, actorId, {
      forceFuelReseal: force.forceFuelReseal,
      forceTollReseal: force.forceTollReseal || assess.needsForceTollReseal,
      forceEarningsReseal: force.forceEarningsReseal,
    });
    didSeal = sealed.didSeal;
  }

  let periodSync = await syncOpenPeriodsToStatementsAfterSeal(orgId, week, {
    rebuildMode: didSeal || anyForce ? "all-open" : "drifted-only",
  });

  // Second pass only when toll books still look wrong after light sync.
  if (periodSync.preRebuildTollDriftCount > 0 || (await orgWeekNeedsForceTollReseal(orgId, week))) {
    const sealed = await ensureCloseLaneStatements(orgId, week, actorId, {
      forceTollReseal: true,
      forceFuelReseal: force.forceFuelReseal,
      forceEarningsReseal: force.forceEarningsReseal,
    });
    didSeal = didSeal || sealed.didSeal;
    periodSync = await syncOpenPeriodsToStatementsAfterSeal(orgId, week, {
      rebuildMode: "all-open",
    });
  }

  // Persist engine drifts only when we wrote seals/books (preview already compares).
  if (didSeal || periodSync.rebuilt > 0) {
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
  }

  const preview = await previewWeekClose(orgId, week);
  preview.tollPeriodSealDriftCount = periodSync.preRebuildTollDriftCount;
  preview.periodsRebuiltAfterSeal = periodSync.rebuilt;
  if (periodSync.failedDriverIds.length > 0) {
    preview.weekBlockers = [
      ...(preview.weekBlockers || []),
      {
        code: "PERIOD_REBUILD_FAILED",
        severity: "block",
        week,
        persisted: periodSync.failedDriverIds.length,
        expected: 0,
        delta: periodSync.failedDriverIds.length,
        message: `Couldn’t refresh books for ${periodSync.failedDriverIds.length} driver(s) — retry`,
      },
    ];
  }
  return preview;
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
  /** Pass 6: drivers whose residual custody was carried (or healed) this run. */
  custodyCarried?: number;
  custodyAmount?: number;
};

/**
 * Close every driver-period for an org-week. Atomic per driver: a driver whose
 * invariants fail is left open with its blockers; drivers that tie are signed.
 * The week is `closed` only when every driver closed with zero blockers.
 *
 * Lean Close: Sync/Refresh owns force reseal. Close runs smart prepare (no
 * forceAllLaneReseals) then verifies + freezes — avoids Edge CPU 546.
 * H-1: pass `skipPrepare: true` when the client already ran a fresh Sync.
 */
export async function closeWeek(
  orgId: string,
  weekKey: string,
  actorId: string,
  reason: string,
  opts?: CloseWeekOpts,
): Promise<CloseWeekResult> {
  const week = String(weekKey).slice(0, 10);
  try {
    assertPeriodEndedForReconciliation(week);
  } catch (e) {
    if (e instanceof SettlementCommandError) {
      throw new WeekCloseError(e.code, e.message, e.status, e.details);
    }
    throw e;
  }

  // C-3: one close/sync at a time per org-week.
  const claimed = await tryClaimWeekCloseLock(orgId, week, actorId);
  if (!claimed) {
    throw new WeekCloseError(
      "CLOSE_IN_PROGRESS",
      "Week close already in progress for this week — retry shortly",
      409,
      { weekKey: week },
    );
  }

  try {
    return await closeWeekBody(orgId, week, actorId, reason, opts);
  } finally {
    await releaseWeekCloseLock(orgId, week, actorId);
  }
}

async function closeWeekBody(
  orgId: string,
  week: string,
  actorId: string,
  reason: string,
  opts?: CloseWeekOpts,
): Promise<CloseWeekResult> {
  // H-1: default still prepares for safety; Close Week UI skips when sync is fresh.
  // P-2: keep prepare preview to reuse weekBlockers / skip redundant P&L when just prepared.
  let prepared: WeekClosePreview | null = null;
  if (!opts?.skipPrepare) {
    prepared = await prepareWeekClose(orgId, week, actorId, {
      ...closeWeekLaneForceOpts(),
      skipCloseLock: true,
    });
    const rebuildBlocker = (prepared.weekBlockers || []).find(
      (b) => b.code === "PERIOD_REBUILD_FAILED",
    );
    if (rebuildBlocker) {
      throw new WeekCloseError(
        "PERIOD_REBUILD_FAILED",
        rebuildBlocker.message ||
          `Couldn’t refresh books for ${rebuildBlocker.persisted} driver(s) — retry Close`,
        409,
        { failedCount: rebuildBlocker.persisted, weekKey: week },
      );
    }
  }

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select(PERIOD_CLOSE_SELECT)
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const perDriver: DriverCloseResult[] = [];
  const allBlockers: CloseBlocker[] = [];
  const periodRows = periods ?? [];
  const driverIds = periodRows.map((p) => String(p.driver_id)).filter(Boolean);

  // P-2: after prepare, reuse P&L weekBlockers and only reload statements (skip engine P&L).
  let statementsByDriver: Map<string, WeekStatement[]>;
  if (prepared) {
    statementsByDriver = await getLatestWeekStatementsForOrgWeek(orgId, week);
    for (const id of driverIds) {
      if (!statementsByDriver.has(id)) statementsByDriver.set(id, []);
    }
    const pnlMismatch = (prepared.weekBlockers || []).find(
      (b) => b.code === "SETTLEMENT_PNL_MISMATCH",
    );
    if (pnlMismatch) {
      allBlockers.push(pnlMismatch);
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
    }
    const pnlWarn = (prepared.weekBlockers || []).find(
      (b) => b.code === "BUSINESS_WEEK_PNL_UNAVAILABLE",
    );
    if (pnlWarn) allBlockers.push(pnlWarn);
  } else {
    const sides = await weekPnlTieSides(orgId, week, driverIds);
    statementsByDriver = sides.statementsByDriver;
    const { settlementSumForWeek, businessWeekPnl } = sides;

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
  }

  // P-3: hoist toll orphan summary once per week.
  let orphansByDriver = new Map<string, TollUsageIntegritySummary>();
  try {
    orphansByDriver = await summarizeTollUsageOrphansByDriverForWeek(week);
  } catch (e) {
    console.warn("[week_close] toll orphan week summarize failed (non-fatal)", week, e);
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

  type CloseVerifyRow = {
    driverId: string;
    period: Record<string, unknown>;
    alreadyClosed: boolean;
    storedHash?: string;
    canClose: boolean;
    blockers: CloseBlocker[];
    statements: WeekStatement[];
    closeReason: string;
    closeHash?: string;
    sourceRowIds?: string[];
    nextMeta?: Record<string, unknown>;
    /** P-6: open custody week resolved during preflight (reuse in carry). */
    resolvedCustodyTarget?: string;
  };

  const closePhaseStarted = Date.now();
  // P-1: read-only verification pooled; freeze writes stay sequential after.
  const verified = await mapPool(periodRows, 6, async (period): Promise<CloseVerifyRow> => {
    const driverId = String(period.driver_id);
    const meta = (period.metadata as Record<string, unknown> | null) || null;
    const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
    const frozen = periodIsFrozen(period as Record<string, unknown>);

    const statements = statementsByDriver.get(driverId) ?? [];
    const pendingDrafts = hasPendingRestatementDrafts(statements);

    if (frozen && !pendingDrafts) {
      return {
        driverId,
        period: period as Record<string, unknown>,
        alreadyClosed: true,
        storedHash: storedCloseHashFromPeriod(period as Record<string, unknown>) || undefined,
        canClose: false,
        blockers: [],
        statements,
        closeReason: reason,
      };
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

    const sum = orphansByDriver.get(driverId);
    const tollEventLedger = tollEventLedgerFromSummary(sum);
    if (
      sum &&
      (sum.orphanCount > 0 ||
        sum.ineligibleEventCount > 0 ||
        sum.amountMismatchCount > 0 ||
        Math.abs(sum.eventSpendMajor - sum.ledgerSpendMajor) > CLOSE_INVARIANT_EPS)
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

    const blockers = checkCloseInvariants({
      period: period as ClosePeriodRow,
      fuelStatement: fuelFromStatement(byKind.get("fuel"), acceptRestatementDrafts),
      tollStatement: tollFromStatement(byKind.get("toll"), acceptRestatementDrafts),
      earningsStatement: earningsFromStatement(byKind.get("earnings"), acceptRestatementDrafts),
      ...cashInvariantFields(meta),
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

    // N-3: refuse close before freeze when no open week can receive custody.
    let resolvedCustodyTarget: string | undefined;
    try {
      const preflight = await custodyCarryPreflight(
        driverId,
        week,
        period as Record<string, unknown>,
        meta,
      );
      if (!preflight.ok) {
        blockers.push(custodyNoOpenTargetBlocker(driverId, week, preflight.held));
      } else if (preflight.targetWeek) {
        resolvedCustodyTarget = preflight.targetWeek;
      }
    } catch (e) {
      console.warn("[week_close] custody preflight failed", driverId, week, e);
      blockers.push({
        code: CUSTODY_ERROR_CODES.NO_OPEN_TARGET,
        severity: "block",
        driverId,
        week,
        persisted: Number(period.cash_still_held) || 0,
        expected: 0,
        delta: Number(period.cash_still_held) || 0,
        message: "Could not verify custody carry target — retry Close",
      });
    }

    if (!canCloseWeek(blockers)) {
      return {
        driverId,
        period: period as Record<string, unknown>,
        alreadyClosed: false,
        canClose: false,
        blockers,
        statements,
        closeReason,
      };
    }

    const sourceRowIds = statements.flatMap((s) => s.sourceRowIds);
    const closeHash = await buildCloseHash(
      buildPeriodCloseHashPayload({
        row: closeHashRowFrom(period as Record<string, unknown>),
        sourceRowIds,
        engineVersion: WEEK_STATEMENT_ENGINE_VERSION,
      }),
    );

    const priorCloseHash = String(fc.priorCloseHash || "").trim();
    if (priorCloseHashChanged(priorCloseHash, closeHash)) {
      blockers.push({
        code: PRIOR_CLOSE_HASH_CHANGED,
        severity: "warn",
        driverId,
        week,
        persisted: 0,
        expected: 0,
        delta: 0,
        message:
          "Re-close hash differs from the prior seal — money may have changed while reopened (reported, not blocked)",
      });
      console.warn("[week_close] re-close hash differs from priorCloseHash", {
        driverId,
        week,
        priorCloseHash,
        closeHash,
      });
    }

    let nextMeta = markPeriodFrozen(period as { metadata?: Record<string, unknown> }, {
      actorId,
      reason: closeReason,
      closeHash,
      sourceRowIds,
      engineVersion: WEEK_STATEMENT_ENGINE_VERSION,
    });
    // H-5: stamp close-time invariant inputs for audit (rebuild-safe).
    nextMeta = stampCloseInvariantSnapshotOnMeta(nextMeta);

    return {
      driverId,
      period: period as Record<string, unknown>,
      alreadyClosed: false,
      canClose: true,
      blockers,
      statements,
      closeReason,
      closeHash,
      sourceRowIds,
      nextMeta,
      resolvedCustodyTarget,
    };
  });
  const verifyMs = Date.now() - closePhaseStarted;

  // N-3: any custody target miss blocks the whole week before seals/freeze (like P&L).
  const custodyBlockers = verified.flatMap((v) =>
    v.blockers.filter((b) => b.code === CUSTODY_ERROR_CODES.NO_OPEN_TARGET),
  );
  if (custodyBlockers.length > 0) {
    allBlockers.push(...custodyBlockers);
    for (const v of verified) {
      if (v.alreadyClosed) {
        perDriver.push({
          driverId: v.driverId,
          closed: true,
          closeHash: v.storedHash,
          blockers: [],
        });
      } else {
        perDriver.push({
          driverId: v.driverId,
          closed: false,
          blockers: v.blockers,
        });
        for (const b of v.blockers) {
          if (b.code !== CUSTODY_ERROR_CODES.NO_OPEN_TARGET) allBlockers.push(b);
        }
      }
    }
    return {
      organizationId: orgId,
      weekKey: week,
      closed: false,
      driversClosed: perDriver.filter((d) => d.closed).length,
      driversBlocked: perDriver.filter((d) => !d.closed).length,
      blockers: allBlockers,
      perDriver,
      custodyCarried: 0,
      custodyAmount: 0,
    };
  }

  // Stable order: statement seals + freezeBatch after pooled verification.
  const resolvedCustodyTargets = new Map<string, string>();
  for (const v of verified) {
    if (v.alreadyClosed) {
      perDriver.push({
        driverId: v.driverId,
        closed: true,
        closeHash: v.storedHash,
        blockers: [],
      });
      continue;
    }
    if (!v.canClose) {
      allBlockers.push(...v.blockers);
      perDriver.push({ driverId: v.driverId, closed: false, blockers: v.blockers });
      continue;
    }

    // Warn-only (e.g. PRIOR_CLOSE_HASH_CHANGED) — still freeze, surface to operator.
    if (v.blockers.length) allBlockers.push(...v.blockers);
    if (v.resolvedCustodyTarget) {
      resolvedCustodyTargets.set(v.driverId, v.resolvedCustodyTarget);
    }

    await closeWeekStatements(orgId, v.driverId, week, actorId, v.closeReason);

    freezeBatch.push({
      id: String(v.period.id),
      driverId: v.driverId,
      closeHash: v.closeHash!,
      metadata: v.nextMeta!,
      closedAt: new Date().toISOString(),
    });
    perDriver.push({
      driverId: v.driverId,
      closed: true,
      closeHash: v.closeHash,
      blockers: v.blockers,
    });
  }

  const freezePhaseStarted = Date.now();
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
  const freezeMs = Date.now() - freezePhaseStarted;

  // Pass 6: carry for just-frozen and already-frozen stranded drivers (N-3 recovery).
  let custodyCarried = 0;
  let custodyAmount = 0;
  const carryPhaseStarted = Date.now();
  try {
    const { data: freshPeriods, error: freshErr } = await sb()
      .from("driver_financial_periods")
      .select(PERIOD_CLOSE_SELECT)
      .eq("organization_id", orgId)
      .eq("period_anchor", week);
    if (freshErr) throw new Error(freshErr.message);
    const custody = await runCustodyCarryForWeek({
      orgId,
      weekKey: week,
      periodRows: (freshPeriods ?? []) as Array<Record<string, unknown>>,
      resolvedTargets: resolvedCustodyTargets,
    });
    custodyCarried = custody.carried;
    custodyAmount = custody.totalAmount;
    if (custody.carried > 0) {
      console.log("[week_close] custody carried forward", custody);
    }
  } catch (e) {
    // N-2/N-3: never swallow CUSTODY_NO_OPEN_TARGET — close must fail loudly.
    // Preflight should make this unreachable; still refuse rather than strand cash.
    if (e instanceof WeekCloseError) throw e;
    console.warn("[week_close] custody carry-forward failed", e);
    throw e;
  }
  const carryMs = Date.now() - carryPhaseStarted;
  // P-6 / Pass 8: phase timings for future 50-driver evidence (no fake scale data).
  console.info("[week_close] close_phase_timing", {
    weekKey: week,
    drivers: periodRows.length,
    freezeBatch: freezeBatch.length,
    verifyMs,
    freezeMs,
    carryMs,
    totalMs: Date.now() - closePhaseStarted,
    custodyCarried,
    custodyAmount,
  });

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
    custodyCarried,
    custodyAmount,
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

  const claimed = await tryClaimWeekCloseLock(orgId, week, actorId);
  if (!claimed) {
    throw new WeekCloseError(
      "CLOSE_IN_PROGRESS",
      "Week close already in progress for this week — retry shortly",
      409,
      { weekKey: week },
    );
  }

  try {
    return await retryFreezeWeekBody(orgId, week, actorId, closeReason);
  } finally {
    await releaseWeekCloseLock(orgId, week, actorId);
  }
}

async function retryFreezeWeekBody(
  orgId: string,
  week: string,
  actorId: string,
  closeReason: string,
): Promise<CloseWeekResult> {
  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select(PERIOD_CLOSE_SELECT)
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
    const frozen = periodIsFrozen(period as Record<string, unknown>);
    const statements = statementsByDriver.get(driverId) ?? [];

    if (frozen) {
      perDriver.push({
        driverId,
        closed: true,
        closeHash: storedCloseHashFromPeriod(period as Record<string, unknown>) || undefined,
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
    const existingHash = storedCloseHashFromPeriod(period as Record<string, unknown>) || "";
    const closeHash = existingHash || await buildCloseHash(
      buildPeriodCloseHashPayload({
        row: closeHashRowFrom(period as Record<string, unknown>),
        sourceRowIds,
        engineVersion: WEEK_STATEMENT_ENGINE_VERSION,
      }),
    );

    let nextMeta = markPeriodFrozen(period as { metadata?: Record<string, unknown> }, {
      actorId,
      reason: closeReason,
      closeHash,
      sourceRowIds,
      engineVersion: WEEK_STATEMENT_ENGINE_VERSION,
    });
    // H-5: stamp close-time invariant inputs when recovering freeze after seal.
    nextMeta = stampCloseInvariantSnapshotOnMeta(nextMeta);

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
    let custodyCarried = 0;
    let custodyAmount = 0;
    try {
      const custody = await runCustodyCarryForWeek({
        orgId,
        weekKey: week,
        periodRows: periodRows as Array<Record<string, unknown>>,
      });
      custodyCarried = custody.carried;
      custodyAmount = custody.totalAmount;
      if (custody.carried > 0) {
        console.log("[week_close] retryFreeze custody carried (no freeze batch)", custody);
      }
    } catch (e) {
      if (e instanceof WeekCloseError) throw e;
      console.warn("[week_close] retryFreeze custody carry failed", e);
      throw e;
    }
    const blocked = perDriver.filter((d) => !d.closed).length;
    return {
      organizationId: orgId,
      weekKey: week,
      closed: blocked === 0 && perDriver.length > 0,
      driversClosed: perDriver.filter((d) => d.closed).length,
      driversBlocked: blocked,
      blockers: perDriver.flatMap((d) => d.blockers),
      perDriver,
      custodyCarried,
      custodyAmount,
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

  // Pass 6 / N-3: complete custody even when freezeBatch was empty (stranded recovery).
  let custodyCarried = 0;
  let custodyAmount = 0;
  try {
    const { data: freshPeriods, error: freshErr } = await sb()
      .from("driver_financial_periods")
      .select(PERIOD_CLOSE_SELECT)
      .eq("organization_id", orgId)
      .eq("period_anchor", week);
    if (freshErr) throw new Error(freshErr.message);
    const custody = await runCustodyCarryForWeek({
      orgId,
      weekKey: week,
      periodRows: (freshPeriods ?? []) as Array<Record<string, unknown>>,
    });
    custodyCarried = custody.carried;
    custodyAmount = custody.totalAmount;
    if (custody.carried > 0) {
      console.log("[week_close] retryFreeze custody carried", custody);
    }
  } catch (e) {
    if (e instanceof WeekCloseError) throw e;
    console.warn("[week_close] retryFreeze custody carry failed", e);
    throw e;
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
    custodyCarried,
    custodyAmount,
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
 * Ops accepts statement (ledger) Uber cash for Close Week M-1.
 * Does not rewrite passenger cash — only stamps financeCore.cashSourceAck.
 */
export async function acknowledgeCashSourceMismatch(
  orgId: string,
  weekKey: string,
  driverId: string,
  actorId: string,
  reason: string,
): Promise<{
  weekKey: string;
  driverId: string;
  ack: CashSourceAck;
  mismatch: WeekCloseCashSourceMismatch;
}> {
  const week = String(weekKey).slice(0, 10);
  const did = String(driverId || "").trim();
  const trimmedReason = String(reason || "").trim();
  if (!WEEK_RE_INTERNAL.test(week)) {
    throw new WeekCloseError("INVALID_WEEK", "weekKey (YYYY-MM-DD) is required", 400);
  }
  if (!did) {
    throw new WeekCloseError("DRIVER_REQUIRED", "driverId is required", 400);
  }
  if (trimmedReason.length < 8) {
    throw new WeekCloseError(
      "REASON_REQUIRED",
      "Enter a reason (at least 8 characters) for accepting statement cash",
      400,
    );
  }

  const { data: period, error } = await sb()
    .from("driver_financial_periods")
    .select(PERIOD_CLOSE_SELECT)
    .eq("organization_id", orgId)
    .eq("period_anchor", week)
    .eq("driver_id", did)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!period) {
    throw new WeekCloseError("PERIOD_NOT_FOUND", "No driver financial period for that week", 404);
  }

  const meta = (period.metadata as Record<string, unknown> | null) || {};
  const cash = readFinanceCoreCash(meta);
  if (Math.abs(cash.cashSourceMismatch) <= CLOSE_INVARIANT_EPS) {
    throw new WeekCloseError(
      "NO_MISMATCH",
      "Statement cash already ties to trip cash for this driver-week",
      409,
    );
  }

  const now = new Date().toISOString();
  const ack: CashSourceAck = {
    at: now,
    by: actorId || null,
    reason: trimmedReason,
    uberCash: cash.uberCash,
    uberTripCash: cash.uberTripCash,
    mismatchAtAck: cash.cashSourceMismatch,
  };

  const priorFc = (meta.financeCore as Record<string, unknown> | undefined) || {};
  const nextMeta: Record<string, unknown> = {
    ...meta,
    financeCore: {
      ...priorFc,
      cashSourceAck: ack,
    },
  };

  const { error: updErr } = await sb()
    .from("driver_financial_periods")
    .update({ metadata: nextMeta, updated_at: now })
    .eq("organization_id", orgId)
    .eq("period_anchor", week)
    .eq("driver_id", did);
  if (updErr) throw new Error(updErr.message);

  return {
    weekKey: week,
    driverId: did,
    ack,
    mismatch: {
      driverId: did,
      driverName:
        (period as { driver_name?: string | null }).driver_name != null
          ? String((period as { driver_name?: string | null }).driver_name)
          : null,
      weekKey: week,
      uberCash: cash.uberCash,
      uberTripCash: cash.uberTripCash,
      mismatch: cash.cashSourceMismatch,
      ack,
    },
  };
}

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
    .select(PERIOD_CLOSE_SELECT)
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

  // N-1 preflight: refuse reopen if any transferred custody sits on a still-frozen successor.
  for (const period of frozenRows) {
    const fc = ((period.metadata as Record<string, unknown>)?.financeCore || {}) as Record<
      string,
      unknown
    >;
    const marks = readCustodyTransferMarks(fc);
    if (!marks.transferredTo || marks.transferredAmount <= CLOSE_INVARIANT_EPS) continue;
    const { data: succ, error: succErr } = await sb()
      .from("driver_financial_periods")
      .select("id, metadata, status, settlement_status, closed_at")
      .eq("driver_id", String(period.driver_id))
      .eq("period_anchor", marks.transferredTo)
      .maybeSingle();
    if (succErr) throw new Error(succErr.message);
    if (
      succ?.id &&
      periodIsFrozen({
        metadata: succ.metadata,
        settlement_status: succ.settlement_status,
        status: succ.status,
        closed_at: succ.closed_at,
      } as Record<string, unknown>)
    ) {
      throw new WeekCloseError(
        CUSTODY_ERROR_CODES.SUCCESSOR_FROZEN,
        `Reopen ${week} would double-count custody still parked on closed week ${marks.transferredTo} — reopen ${marks.transferredTo} first`,
        409,
        {
          driverId: String(period.driver_id),
          weekKey: week,
          successorWeek: marks.transferredTo,
          amount: marks.transferredAmount,
        },
      );
    }
  }

  const now = new Date().toISOString();
  let driversReopened = 0;

  for (const period of frozenRows) {
    const driverId = String(period.driver_id);
    const priorMeta = (period.metadata as Record<string, unknown>) || {};
    // N-1: reverse carry before clearPeriodFreeze so Collect never double-counts.
    const metaAfterReverse = await reverseCustodyCarryOnReopen({
      driverId,
      weekKey: week,
      metadata: priorMeta,
    });

    const nextMeta = clearPeriodFreeze(
      { metadata: metaAfterReverse },
      {
        actorId,
        reason: trimmedReason,
        reopenedAt: now,
      },
    );
    // Ensure transfer marks stay cleared after clearPeriodFreeze (preserves other fc keys).
    const fc = { ...((nextMeta.financeCore as Record<string, unknown>) || {}) };
    nextMeta.financeCore = clearCustodyTransferMarks(fc);

    const { error: updErr } = await sb()
      .from("driver_financial_periods")
      .update({
        status: "reopened",
        closed_at: null,
        reopened_at: now,
        // H-3: null (not "") so reopen does not look like "never sealed".
        // clearPeriodFreeze already archived the seal into reopenHistory + priorCloseHash.
        source_event_hash: null,
        close_hash: null,
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
