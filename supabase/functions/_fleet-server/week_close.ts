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
import { markPeriodFrozen } from "./settlement_period_freeze.ts";
import {
  closeWeekStatements,
  getLatestWeekStatements,
  WEEK_STATEMENT_ENGINE_VERSION,
} from "./week_statements.ts";
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

function fuelFromStatement(s: WeekStatement | undefined): CloseFuelStatement | null {
  if (!s) return null;
  return {
    driverShare: minorToMajor(s.amountsMinor.driverShare),
    companyShare: minorToMajor(s.amountsMinor.companyShare),
  };
}

function tollFromStatement(s: WeekStatement | undefined): CloseTollStatement | null {
  if (!s) return null;
  return {
    totalSpend: minorToMajor(s.amountsMinor.totalSpend),
    chargedToDriver: minorToMajor(s.amountsMinor.chargedToDriver),
    reimbursed: minorToMajor(s.amountsMinor.reimbursed),
    netLoss: minorToMajor(s.amountsMinor.netLoss),
    cashWashSpend: minorToMajor(s.amountsMinor.cashWashSpend),
    tagSpend: minorToMajor(s.amountsMinor.tagSpend),
  };
}

function earningsFromStatement(s: WeekStatement | undefined): CloseEarningsStatement | null {
  if (!s) return null;
  return {
    passengerCash: minorToMajor(s.amountsMinor.passengerCash),
    driverShare: minorToMajor(s.amountsMinor.driverShare),
    companyShare: minorToMajor(s.amountsMinor.companyShare),
    tipsPaidToDriver: minorToMajor(s.amountsMinor.tipsPaidToDriver),
  };
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
  fuel: WeekCloseFuelLane;
  toll: WeekCloseTollLane;
  blockers: CloseBlocker[];
};

/**
 * Read-only dry run of {@link closeWeek}: computes per-driver cross-system
 * blockers and the aggregated fuel / toll lanes for the Close Week screen.
 * Writes nothing — safe to poll from the UI.
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
  let driversReady = 0;

  let fuelDriverShare = 0;
  let fuelFleetShare = 0;
  let fuelFinalized = rows.length > 0;
  let tollSpend = 0;
  let tollReimbursed = 0;
  let tollCharged = 0;
  let tollNetLoss = 0;

  for (const period of rows) {
    const driverId = String(period.driver_id);
    const statements = await getLatestWeekStatements(orgId, driverId, week);
    const byKind = new Map<string, WeekStatement>(statements.map((s) => [s.kind, s]));

    const fuelStatement = fuelFromStatement(byKind.get("fuel"));
    const tollStatement = tollFromStatement(byKind.get("toll"));

    const driverBlockers = checkCloseInvariants({
      period: period as ClosePeriodRow,
      fuelStatement,
      tollStatement,
      earningsStatement: earningsFromStatement(byKind.get("earnings")),
    });
    blockers.push(...driverBlockers);
    if (canCloseWeek(driverBlockers)) driversReady += 1;

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

  return {
    weekKey: week,
    driversTotal: rows.length,
    driversReady,
    driversBlocked: rows.length - driversReady,
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

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const perDriver: DriverCloseResult[] = [];
  const allBlockers: CloseBlocker[] = [];

  for (const period of periods ?? []) {
    const driverId = String(period.driver_id);
    const statements = await getLatestWeekStatements(orgId, driverId, week);
    const byKind = new Map<string, WeekStatement>(statements.map((s) => [s.kind, s]));

    const blockers = checkCloseInvariants({
      period: period as ClosePeriodRow,
      fuelStatement: fuelFromStatement(byKind.get("fuel")),
      tollStatement: tollFromStatement(byKind.get("toll")),
      earningsStatement: earningsFromStatement(byKind.get("earnings")),
    });

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

    await closeWeekStatements(orgId, driverId, week, actorId, reason);

    const nextMeta = markPeriodFrozen(period as { metadata?: Record<string, unknown> }, {
      actorId,
      reason,
      closeHash,
    });

    const { error: updErr } = await sb()
      .from("driver_financial_periods")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
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
