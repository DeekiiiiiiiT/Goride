/**
 * Real week close (audit §6.4, Phase 5 / C-6).
 *
 * closeWeek runs the cross-system invariants as a PRECONDITION of closing:
 * the period projection must tie to the independent fuel/toll/earnings
 * statements and to the earnings identity. Any failure blocks the close and
 * returns named, actionable drift records — no freeze is written. When every
 * driver ties, statements are signed, an H-4 close hash is stored, and freeze
 * metadata is written so no further movement can post to the week.
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
  hasPendingRestatementDrafts,
  WEEK_STATEMENT_ENGINE_VERSION,
} from "./week_statements.ts";
import { sealTollWeek } from "./toll_week_seal.ts";
import { sealFuelWeek } from "./fuel_week_seal.ts";
import { sealEarningsWeek } from "./earnings_week_seal.ts";
import { compareDriverWeekStatementsToEngines } from "./statement_engine_probe.ts";
import { upsertFinanceReconDrifts, countOpenFinanceReconDrifts } from "./finance_recon_drift.ts";
import { sumBusinessWeekPnlMajor } from "./business_week_pnl.ts";
import { engineDriftsToCloseBlockers } from "../../../packages/finance-core/src/statementEngineCompare.ts";
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
  return isPeriodFrozen({
    metadata: meta,
    settlementStatus: period.settlement_status ? String(period.settlement_status) : null,
    signedAt: period.signed_at
      ? String(period.signed_at)
      : fc.signedAt
        ? String(fc.signedAt)
        : null,
  });
}

function settlementRiskForPeriod(period: Record<string, unknown>): {
  risk: boolean;
  settlementPaid: number;
  settlementAmount: number;
} {
  const settlementPaid = Number(period.settlement_paid) || 0;
  const settlementAmount = Number(period.settlement_amount) || 0;
  const risk = Math.abs(settlementPaid) > CLOSE_INVARIANT_EPS;
  return { risk, settlementPaid, settlementAmount };
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
  if (fuelNeedsSeal || (anyOpenDriver && fuelLaneMissing)) {
    try {
      await sealFuelWeek({ organizationId: orgId, weekKey: week, actorId });
    } catch (e) {
      console.warn("[week_close] fuel auto-seal failed (non-fatal)", week, e);
    }
  }

  if (tollNeedsSeal || (anyOpenDriver && tollLaneMissing)) {
    try {
      await sealTollWeek({ organizationId: orgId, weekKey: week, actorId });
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
 * Read-only dry run of {@link closeWeek}: computes per-driver cross-system
 * blockers and the aggregated fuel / toll lanes for the Close Week screen.
 * Auto-seals missing earnings/toll lanes first (idempotent), then reads.
 */
export async function previewWeekClose(orgId: string, weekKey: string): Promise<WeekClosePreview> {
  const week = String(weekKey).slice(0, 10);

  await ensureCloseLaneStatements(orgId, week);

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const rows = periods ?? [];
  const blockers: CloseBlocker[] = [];
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

  // Pass 5.4: desk fleet-P&L composition vs sealed statement fleet-P&L.
  const settlementSumForWeek = rows.reduce((s, p) => {
    const fleet = Number(p.fleet_share) || 0;
    const fuel = Number(p.fuel_fleet_share) || 0;
    const tollNet =
      (Number(p.toll_spend) || 0) -
      (Number(p.toll_reimbursed) || 0) -
      (Number(p.toll_charged_to_driver) || 0);
    return s + fleet + fuel + tollNet;
  }, 0);
  const businessWeekPnl = await sumBusinessWeekPnlMajor(orgId, week);

  let pnlWarnEmitted = false;

  for (const period of rows) {
    const driverId = String(period.driver_id);
    const meta = (period.metadata as Record<string, unknown> | null) || null;
    const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
    const frozen = periodIsFrozen(period as Record<string, unknown>);

    const statements = await getLatestWeekStatements(orgId, driverId, week);
    const pendingDrafts = hasPendingRestatementDrafts(statements);
    if (pendingDrafts) {
      pendingRestatementCount += statements.filter(
        (s) => s.status === "draft" && Boolean(s.supersedes),
      ).length;
    }

    if (frozen) {
      driversFrozen += 1;
      if (!pendingDrafts) driversFrozenIdle += 1;
      if (settlementRiskForPeriod(period as Record<string, unknown>).risk) {
        settlementRiskDriverCount += 1;
      }
      const signed =
        (fc.signedAt ? String(fc.signedAt) : null) ||
        (period.signed_at ? String(period.signed_at) : null);
      if (signed && (!closedAt || signed < closedAt)) closedAt = signed;
    }

    const acceptRestatementDrafts = frozen && pendingDrafts;
    const byKind = new Map<string, WeekStatement>(statements.map((s) => [s.kind, s]));

    const fuelStatement = fuelFromStatement(byKind.get("fuel"), acceptRestatementDrafts);
    const tollStatement = tollFromStatement(byKind.get("toll"), acceptRestatementDrafts);

    let engineBlockers: CloseBlocker[] = [];
    // Frozen without pending restatements: skip engine compare (already signed).
    // Frozen WITH drafts: compare so Sign restatements shows blockers.
    if (!frozen || acceptRestatementDrafts) {
      try {
        const engineDrifts = await compareDriverWeekStatementsToEngines({
          organizationId: orgId,
          driverId,
          weekKey: week,
          statements,
        });
        if (engineDrifts.length) {
          await upsertFinanceReconDrifts({
            organizationId: orgId,
            driverId,
            weekKey: week,
            source: "close_preview",
            drifts: engineDrifts,
            statementVersion: statements[0]?.version ?? null,
          });
          engineBlockers = engineDriftsToCloseBlockers(engineDrifts, {
            driverId,
            week,
          }) as CloseBlocker[];
        } else {
          await upsertFinanceReconDrifts({
            organizationId: orgId,
            driverId,
            weekKey: week,
            source: "close_preview",
            drifts: [],
          });
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
        const { summarizeTollUsageOrphansForWeek } = await import("./toll_financial_reset.ts");
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
          await upsertFinanceReconDrifts({
            organizationId: orgId,
            driverId,
            weekKey: week,
            source: "close_preview",
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
          });
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
      ...((!frozen || acceptRestatementDrafts) && !pnlWarnEmitted
        ? businessWeekPnl != null
          ? { settlementSumForWeek, businessWeekPnl }
          : { settlementSumForWeek, businessWeekPnlUnavailable: true as const }
        : {}),
    });
    if ((!frozen || acceptRestatementDrafts) && !pnlWarnEmitted) pnlWarnEmitted = true;
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
    openEngineDriftCount,
    pendingRestatementCount,
    settlementRiskDriverCount,
  };
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
  const settlementSumForWeek = periodRows.reduce((s, p) => {
    const fleet = Number(p.fleet_share) || 0;
    const fuel = Number(p.fuel_fleet_share) || 0;
    const tollNet =
      (Number(p.toll_spend) || 0) -
      (Number(p.toll_reimbursed) || 0) -
      (Number(p.toll_charged_to_driver) || 0);
    return s + fleet + fuel + tollNet;
  }, 0);
  const businessWeekPnl = await sumBusinessWeekPnlMajor(orgId, week);
  let pnlWarnEmitted = false;

  for (const period of periodRows) {
    const driverId = String(period.driver_id);
    const meta = (period.metadata as Record<string, unknown> | null) || null;
    const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
    const frozen = periodIsFrozen(period as Record<string, unknown>);

    const statements = await getLatestWeekStatements(orgId, driverId, week);
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
      await upsertFinanceReconDrifts({
        organizationId: orgId,
        driverId,
        weekKey: week,
        source: "close",
        drifts: engineDrifts,
        statementVersion: statements[0]?.version ?? null,
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

    let tollEventLedger: {
      orphanCount: number;
      orphanAmountMajor: number;
      eventSpendMajor: number;
      ledgerSpendMajor: number;
    } | null = null;
    try {
      const { summarizeTollUsageOrphansForWeek } = await import("./toll_financial_reset.ts");
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
        await upsertFinanceReconDrifts({
          organizationId: orgId,
          driverId,
          weekKey: week,
          source: "close",
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
      ...(!pnlWarnEmitted
        ? businessWeekPnl != null
          ? { settlementSumForWeek, businessWeekPnl }
          : { settlementSumForWeek, businessWeekPnlUnavailable: true as const }
        : {}),
    });
    pnlWarnEmitted = true;

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

    const { error: updErr } = await sb()
      .from("driver_financial_periods")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        reopened_at: null,
        source_event_hash: closeHash,
        metadata: nextMeta,
      })
      .eq("id", period.id);
    if (updErr) throw new Error(updErr.message);

    perDriver.push({ driverId, closed: true, closeHash, blockers: [] });
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
