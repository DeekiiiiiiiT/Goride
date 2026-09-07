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
import { isPeriodFrozen, markPeriodFrozen } from "./settlement_period_freeze.ts";
import {
  closeWeekStatements,
  getLatestWeekStatements,
  publishWeekStatement,
  WEEK_STATEMENT_ENGINE_VERSION,
} from "./week_statements.ts";
import { sealTollWeek } from "./toll_week_seal.ts";
import { sealFuelWeek } from "./fuel_week_seal.ts";
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
  /** Drivers whose period is already frozen / signed (week close done). */
  driversFrozen: number;
  /** True when every driver-period for the week is frozen. */
  weekClosed: boolean;
  /** Earliest freeze timestamp across frozen drivers, if any. */
  closedAt: string | null;
  fuel: WeekCloseFuelLane;
  toll: WeekCloseTollLane;
  blockers: CloseBlocker[];
};

/**
 * Close Program Pass 2 precondition: make sure every active driver-week has
 * fuel / earnings / toll statements before invariants run.
 *
 * Fuel + Toll: re-seal from live rebuild/events while the week is still open
 * (force=false skips unchanged amounts). Closed/frozen weeks are never
 * auto-restated — force-seal or Restatement Queue.
 * Earnings: publish ONLY when a lane is absent.
 */
async function ensureCloseLaneStatements(
  orgId: string,
  week: string,
  actorId?: string,
): Promise<void> {
  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, cash_collected, driver_share, fleet_share, tips_paid_to_driver, earnings_gross, settlement_amount, fuel_deduction, fuel_fleet_share, fuel_finalized, settlement_status, metadata",
    )
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  let tollLaneMissing = false;
  let fuelLaneMissing = false;
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
    const kinds = new Set(statements.map((s) => s.kind));

    if (!kinds.has("fuel")) fuelLaneMissing = true;

    if (!kinds.has("earnings")) {
      try {
        await publishWeekStatement({
          kind: "earnings",
          organizationId: orgId,
          driverId,
          weekKey: week,
          amountsMinor: {
            passengerCash: Math.round((Number(p.cash_collected) || 0) * 100),
            driverShare: Math.round((Number(p.driver_share) || 0) * 100),
            companyShare: Math.round((Number(p.fleet_share) || 0) * 100),
            tipsPaidToDriver: Math.round((Number(p.tips_paid_to_driver) || 0) * 100),
            gross: Math.round((Number(p.earnings_gross) || 0) * 100),
            settlementAmount: Math.round((Number(p.settlement_amount) || 0) * 100),
          },
          status: "closed",
          closedBy: actorId ?? "week_close_autoseal",
          closeReason: "close_precondition",
        });
      } catch (e) {
        console.warn("[week_close] earnings auto-publish failed (non-fatal)", driverId, week, e);
      }
    }

    if (!kinds.has("toll")) tollLaneMissing = true;
  }

  if (anyOpenDriver || fuelLaneMissing) {
    try {
      await sealFuelWeek({ organizationId: orgId, weekKey: week, actorId });
    } catch (e) {
      console.warn("[week_close] fuel auto-seal failed (non-fatal)", week, e);
    }
  }

  // Refresh toll statement from events while open; only backfill if missing when frozen.
  if (anyOpenDriver || tollLaneMissing) {
    try {
      await sealTollWeek({ organizationId: orgId, weekKey: week, actorId });
    } catch (e) {
      console.warn("[week_close] toll auto-seal failed (non-fatal)", week, e);
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
  let closedAt: string | null = null;

  let fuelDriverShare = 0;
  let fuelFleetShare = 0;
  let fuelFinalized = rows.length > 0;
  let tollSpend = 0;
  let tollReimbursed = 0;
  let tollCharged = 0;
  let tollNetLoss = 0;

  for (const period of rows) {
    const driverId = String(period.driver_id);
    const meta = (period.metadata as Record<string, unknown> | null) || null;
    const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
    const frozen = isPeriodFrozen({
      metadata: meta,
      settlementStatus: period.settlement_status ? String(period.settlement_status) : null,
      signedAt: period.signed_at
        ? String(period.signed_at)
        : fc.signedAt
          ? String(fc.signedAt)
          : null,
    });
    if (frozen) {
      driversFrozen += 1;
      const signed =
        (fc.signedAt ? String(fc.signedAt) : null) ||
        (period.signed_at ? String(period.signed_at) : null);
      if (signed && (!closedAt || signed < closedAt)) closedAt = signed;
    }

    const statements = await getLatestWeekStatements(orgId, driverId, week);
    const byKind = new Map<string, WeekStatement>(statements.map((s) => [s.kind, s]));

    const fuelStatement = fuelFromStatement(byKind.get("fuel"));
    const tollStatement = tollFromStatement(byKind.get("toll"));

    const driverBlockers = checkCloseInvariants({
      period: period as ClosePeriodRow,
      fuelStatement,
      tollStatement,
      earningsStatement: earningsFromStatement(byKind.get("earnings")),
      cashSourceMismatch: Number(
        (meta as { financeCore?: { cashSourceMismatch?: number } } | null)
          ?.financeCore?.cashSourceMismatch,
      ) || 0,
    });
    // Already-frozen drivers are not "blockers" for close — they are done.
    if (!frozen) {
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

  return {
    weekKey: week,
    driversTotal: rows.length,
    driversReady,
    driversBlocked: rows.length - driversReady - driversFrozen,
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

  for (const period of periods ?? []) {
    const driverId = String(period.driver_id);
    const meta = (period.metadata as Record<string, unknown> | null) || null;
    const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
    if (
      isPeriodFrozen({
        metadata: meta,
        settlementStatus: period.settlement_status ? String(period.settlement_status) : null,
        signedAt: period.signed_at
          ? String(period.signed_at)
          : fc.signedAt
            ? String(fc.signedAt)
            : null,
      })
    ) {
      // Idempotent: already frozen — count as closed, do not re-hash / re-write.
      perDriver.push({
        driverId,
        closed: true,
        closeHash: String(period.source_event_hash || fc.closeHash || "") || undefined,
        blockers: [],
      });
      continue;
    }

    const statements = await getLatestWeekStatements(orgId, driverId, week);
    const byKind = new Map<string, WeekStatement>(statements.map((s) => [s.kind, s]));

    const blockers = checkCloseInvariants({
      period: period as ClosePeriodRow,
      fuelStatement: fuelFromStatement(byKind.get("fuel")),
      tollStatement: tollFromStatement(byKind.get("toll")),
      earningsStatement: earningsFromStatement(byKind.get("earnings")),
      cashSourceMismatch: Number(
        (meta as { financeCore?: { cashSourceMismatch?: number } } | null)
          ?.financeCore?.cashSourceMismatch,
      ) || 0,
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
