/**
 * Preview and post one fuel-share correction per closed week onto the open week.
 * Closed weeks stay closed. Cash held is not used as the bucket.
 */
import { getServiceClient } from "./service_client.ts";
import { periodGateFromRow, isPeriodFrozen } from "./settlement_period_freeze.ts";
import { buildMovementRow } from "./settlement_commands.ts";
import { persistPeriodRowWithVersion } from "./period_persist.ts";
import { syncPeriodCashFromTransactions } from "./driver_financial_periods.ts";
import {
  fuelShareCorrectionDelta,
  fuelShareCorrectionSentence,
  sumCorrectionLines,
  type CorrectionLine,
} from "../../../packages/finance-core/src/fuelShareCorrection.ts";
import { round2 } from "../../../packages/finance-core/src/money.ts";
import {
  buildCloseHash,
  buildPeriodCloseHashPayload,
} from "../../../packages/finance-core/src/closeHash.ts";
import { getLatestWeekStatement } from "./week_statements.ts";

const FROM = "2026-01-19";
const THROUGH = "2026-08-31";

function sb() {
  return getServiceClient();
}

function minorToMajor(n: unknown): number {
  return round2((Number(n) || 0) / 100);
}

type PeriodRow = Record<string, unknown>;

function fcOf(row: PeriodRow): Record<string, unknown> {
  const meta = (row.metadata || {}) as Record<string, unknown>;
  return { ...((meta.financeCore as Record<string, unknown>) || {}) };
}

async function fuelTruth(orgId: string, driverId: string, week: string, row: PeriodRow) {
  const statement = await getLatestWeekStatement(orgId, driverId, week, "fuel");
  const sealed = statement?.status === "closed" ? statement.amountsMinor : null;
  const driverShare = sealed ? minorToMajor(sealed.driverShare) : Number(row.fuel_deduction) || 0;
  const companyShare = sealed ? minorToMajor(sealed.companyShare) : Number(row.fuel_fleet_share) || 0;
  const driverPaid = Number(row.fuel_driver_spend) || 0;
  const total = round2(driverShare + companyShare);
  const gasCard = round2(Math.max(0, total - driverPaid));
  return { driverShare, companyShare, driverPaid, gasCard, sealed: Boolean(sealed) };
}

function hashRow(row: PeriodRow, fuelDeduction: number, fuelFleetShare: number) {
  const n = (k: string) => Number(row[k]) || 0;
  return {
    tollSpend: n("toll_spend"),
    tollCashSpend: n("toll_cash_spend"),
    tollTagSpend: n("toll_tag_spend"),
    tollReimbursed: n("toll_reimbursed"),
    tollChargedToDriver: n("toll_charged_to_driver"),
    tollUnmatchedCount: n("toll_unmatched_count"),
    disputeRefundMatched: n("dispute_refund_matched"),
    disputeRefundUnmatched: n("dispute_refund_unmatched"),
    fuelDeduction,
    fuelFleetShare,
    fuelFinalized: Boolean(row.fuel_finalized),
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

export type FuelCorrectionPreviewLine = CorrectionLine & {
  driverPaidFuel: number;
  companyFuelShare: number;
  alreadyMoved: boolean;
};

export async function previewFuelShareCorrections(organizationId: string, driverId?: string) {
  let q = sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", organizationId)
    .gte("period_anchor", FROM)
    .lte("period_anchor", THROUGH)
    .order("period_anchor", { ascending: true });
  if (driverId) q = q.eq("driver_id", driverId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const lines: Array<FuelCorrectionPreviewLine & { driverId: string }> = [];
  for (const row of data || []) {
    if (!isPeriodFrozen(periodGateFromRow(row))) continue;
    const id = String(row.driver_id);
    const week = String(row.period_anchor).slice(0, 10);
    const truth = await fuelTruth(organizationId, id, week, row);
    const delta = fuelShareCorrectionDelta({
      driverPaidFuel: truth.driverPaid,
      companyFuelShare: truth.companyShare,
    });
    if (Math.abs(delta) <= 0.01) continue;
    const moved = fcOf(row).balanceMovedTo;
    lines.push({
      driverId: id,
      sourceWeek: week,
      amount: delta,
      sentence: fuelShareCorrectionSentence({ week, delta, gasCard: truth.gasCard }),
      kind: "fuel_share",
      driverPaidFuel: truth.driverPaid,
      companyFuelShare: truth.companyShare,
      alreadyMoved: Boolean(moved),
    });
  }
  return {
    lines: lines.filter((l) => !l.alreadyMoved),
    net: round2(lines.filter((l) => !l.alreadyMoved).reduce((s, l) => s + l.amount, 0)),
  };
}

async function openWeek(organizationId: string, driverId: string): Promise<PeriodRow> {
  const { data, error } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .order("period_anchor", { ascending: false });
  if (error) throw new Error(error.message);
  const open = (data || []).find((row) => !isPeriodFrozen(periodGateFromRow(row)));
  if (!open) throw new Error("NO_OPEN_WEEK");
  return open;
}

export async function applyFuelShareCorrections(opts: {
  organizationId: string;
  driverId?: string;
  actorId?: string | null;
  confirm: boolean;
}) {
  const preview = await previewFuelShareCorrections(opts.organizationId, opts.driverId);
  if (!opts.confirm) return { preview: true, ...preview, applied: false };

  const byDriver = new Map<string, FuelCorrectionPreviewLine[]>();
  for (const line of preview.lines) {
    const id = (line as { driverId: string }).driverId;
    const list = byDriver.get(id) || [];
    list.push(line);
    byDriver.set(id, list);
  }

  for (const [driverId, lines] of byDriver) {
    const open = await openWeek(opts.organizationId, driverId);
    const openAnchor = String(open.period_anchor).slice(0, 10);
    const meta = { ...((open.metadata as Record<string, unknown>) || {}) };
    const fc = fcOf(open);
    const existing = Array.isArray(fc.correctionLines)
      ? (fc.correctionLines as CorrectionLine[])
      : [];
    const have = new Set(existing.map((l) => `${l.kind}:${l.sourceWeek}`));

    const receivable = fc.fuelCreditReceivable as { sourceWeek?: string; amount?: number } | undefined;
    let opening = round2(Number(fc.openingCashCustody) || 0);
    if (receivable?.sourceWeek && (Number(receivable.amount) || 0) > 0.01) {
      const source = String(receivable.sourceWeek).slice(0, 10);
      const amount = -round2(Number(receivable.amount) || 0);
      const key = `fuel_share:${source}`;
      if (!have.has(key)) {
        existing.push({
          sourceWeek: source,
          amount,
          kind: "fuel_share",
          sentence: fuelShareCorrectionSentence({
            week: source,
            delta: amount,
            gasCard: Math.abs(amount),
          }),
        });
        have.add(key);
        opening = round2(Math.max(0, opening - Math.abs(amount)));
      }
      delete fc.fuelCreditReceivable;
      delete fc.fuelCreditReceivableApplied;
    }

    for (const line of lines) {
      const key = `${line.kind}:${line.sourceWeek}`;
      if (have.has(key)) continue;
      existing.push({
        sourceWeek: line.sourceWeek,
        amount: line.amount,
        sentence: line.sentence,
        kind: "fuel_share",
      });
      have.add(key);
      await restateClosedFuel(opts.organizationId, driverId, line.sourceWeek, openAnchor);
      const idempotencyKey = `fuel-share-correction:${driverId}:${line.sourceWeek}`;
      const { data: prior } = await sb()
        .from("settlement_movements")
        .select("id")
        .eq("organization_id", opts.organizationId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (!prior) {
        const row = buildMovementRow({
          organizationId: opts.organizationId,
          driverId,
          periodAnchor: openAnchor,
          kind: "correction",
          amountMinor: Math.round(line.amount * 100),
          reason: line.sentence,
          actorId: opts.actorId || null,
          idempotencyKey,
          metadata: { sourceWeek: line.sourceWeek, backfill: false },
        });
        const { error: insErr } = await sb().from("settlement_movements").insert(row);
        if (insErr && !/duplicate|unique/i.test(insErr.message || "")) throw new Error(insErr.message);
      }
    }

    fc.correctionLines = existing;
    fc.postedAdjustments = sumCorrectionLines(existing);
    fc.openingCashCustody = opening;
    meta.financeCore = fc;
    await persistPeriodRowWithVersion(driverId, openAnchor, {
      metadata: meta,
      updated_at: new Date().toISOString(),
    });
    await syncPeriodCashFromTransactions(driverId, openAnchor);
  }

  return { preview: false, ...preview, applied: true };
}

async function restateClosedFuel(
  orgId: string,
  driverId: string,
  week: string,
  movedTo: string,
) {
  const { data: row, error } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", orgId)
    .eq("driver_id", driverId)
    .eq("period_anchor", week)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return;
  const truth = await fuelTruth(orgId, driverId, week, row);
  const meta = { ...((row.metadata as Record<string, unknown>) || {}) };
  const fc = fcOf(row);
  fc.fuelRestatedFromStatement = truth.sealed;
  fc.fuelRestatedAt = new Date().toISOString();
  fc.balanceMovedTo = movedTo;
  meta.financeCore = fc;
  const fuelDeduction = truth.sealed ? truth.driverShare : Number(row.fuel_deduction) || 0;
  const fuelFleetShare = truth.sealed ? truth.companyShare : Number(row.fuel_fleet_share) || 0;
  const storedIds = Array.isArray(fc.closeSourceRowIds)
    ? (fc.closeSourceRowIds as unknown[]).map(String)
    : [];
  const engine =
    typeof fc.closeEngineVersion === "string" && fc.closeEngineVersion.trim()
      ? String(fc.closeEngineVersion)
      : "week-statement@1";
  const closeHash = await buildCloseHash(
    buildPeriodCloseHashPayload({
      row: hashRow(row, fuelDeduction, fuelFleetShare),
      sourceRowIds: storedIds,
      engineVersion: engine,
    }),
  );
  const { error: updErr } = await sb()
    .from("driver_financial_periods")
    .update({
      fuel_deduction: fuelDeduction,
      fuel_fleet_share: fuelFleetShare,
      close_hash: closeHash,
      metadata: meta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updErr) throw new Error(updErr.message);
}
