/**
 * Preview and post one fuel-share correction per closed week onto the open week.
 * The closed week's money is not rewritten. Cash held is not the bucket.
 */
import { getServiceClient } from "./service_client.ts";
import { periodGateFromRow, isPeriodFrozen } from "./settlement_period_freeze.ts";
import { buildMovementRow, SettlementCommandError } from "./settlement_commands.ts";
import { persistPeriodRowWithVersion } from "./period_persist.ts";
import { syncPeriodCashFromTransactions } from "./driver_financial_periods.ts";
import {
  FUEL_CORRECTION_FROM,
  FUEL_CORRECTION_THROUGH,
  correctionPreviewAccepted,
  fuelShareCorrectionDelta,
  fuelShareCorrectionSentence,
  sumCorrectionLines,
  type CorrectionLine,
} from "../../../packages/finance-core/src/fuelShareCorrection.ts";
import { round2 } from "../../../packages/finance-core/src/money.ts";

const FROM = FUEL_CORRECTION_FROM;
const THROUGH = FUEL_CORRECTION_THROUGH;

function sb() {
  return getServiceClient();
}

type PeriodRow = Record<string, unknown>;

function fcOf(row: PeriodRow): Record<string, unknown> {
  const meta = (row.metadata || {}) as Record<string, unknown>;
  return { ...((meta.financeCore as Record<string, unknown>) || {}) };
}

function weekOf(row: PeriodRow): string {
  return String(row.period_anchor).slice(0, 10);
}

export type FuelCorrectionPreviewLine = CorrectionLine & {
  driverPaidFuel: number;
  companyFuelShare: number;
  alreadyMoved: boolean;
};

type Oct12Line = { sourceWeek: string; amount: number; sentence: string } | null;

function receivableOn(row: PeriodRow): Oct12Line {
  const receivable = fcOf(row).fuelCreditReceivable as { sourceWeek?: string; amount?: number } | undefined;
  const amount = round2(Number(receivable?.amount) || 0);
  if (!receivable?.sourceWeek || amount <= 0.01) return null;
  const sourceWeek = String(receivable.sourceWeek).slice(0, 10);
  const delta = -amount;
  return {
    sourceWeek,
    amount: delta,
    sentence: fuelShareCorrectionSentence({
      week: sourceWeek,
      delta,
      gasCard: amount,
    }),
  };
}

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
    const week = weekOf(row);
    const driverPaid = Number(row.fuel_driver_spend) || 0;
    const companyShare = Number(row.fuel_fleet_share) || 0;
    const delta = fuelShareCorrectionDelta({
      driverShare: Number(row.driver_share) || 0,
      fuelDeduction: Number(row.fuel_deduction) || 0,
      cashCollected: Number(row.cash_collected) || 0,
      cashReturned: Number(row.cash_returned) || 0,
      tollChargedToDriver: Number(row.toll_charged_to_driver) || 0,
      tollCashSpend: Number(row.toll_cash_spend) || 0,
      driverPaidFuel: driverPaid,
      cashWrittenOff: Number(row.cash_written_off) || 0,
      settlementPaid: Number(row.settlement_paid) || 0,
      tipsPaidToDriver: Number(row.tips_paid_to_driver) || 0,
      storedSettlement: Number(row.settlement_amount) || 0,
    });
    if (Math.abs(delta) <= 0.01) continue;
    const moved = fcOf(row).balanceMovedTo;
    lines.push({
      driverId: id,
      sourceWeek: week,
      amount: delta,
      sentence: fuelShareCorrectionSentence({
        week,
        delta,
        gasCard: Number(row.fuel_gas_card_spend) || 0,
      }),
      kind: "fuel_share",
      driverPaidFuel: driverPaid,
      companyFuelShare: companyShare,
      alreadyMoved: Boolean(moved),
    });
  }

  const pending = lines.filter((line) => !line.alreadyMoved);
  const oct12 = await openWeekReceivable(organizationId, driverId);
  const check = correctionPreviewAccepted({
    lines: pending,
    oct12Amount: oct12?.amount ?? null,
  });
  return {
    lines: pending,
    net: check.net,
    oct12,
    matchesAudit: check.ok,
    reason: check.reason,
  };
}

async function openWeekReceivable(organizationId: string, driverId?: string): Promise<Oct12Line> {
  let q = sb()
    .from("driver_financial_periods")
    .select("driver_id, period_anchor, status, closed_at, settlement_status, metadata")
    .eq("organization_id", organizationId)
    .order("period_anchor", { ascending: false });
  if (driverId) q = q.eq("driver_id", driverId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    if (isPeriodFrozen(periodGateFromRow(row))) continue;
    const line = receivableOn(row);
    if (line) return line;
  }
  return null;
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
  if (!preview.matchesAudit) {
    throw new SettlementCommandError(
      "CORRECTION_PREVIEW_MISMATCH",
      preview.reason || "Corrections do not match the audit. Nothing was posted.",
      409,
    );
  }

  const byDriver = new Map<string, FuelCorrectionPreviewLine[]>();
  for (const line of preview.lines) {
    const id = (line as { driverId: string }).driverId;
    const list = byDriver.get(id) || [];
    list.push(line);
    byDriver.set(id, list);
  }

  for (const [driverId, lines] of byDriver) {
    const open = await openWeek(opts.organizationId, driverId);
    const openAnchor = weekOf(open);
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
      await stampBalanceMoved(opts.organizationId, driverId, line.sourceWeek, openAnchor);
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

/** Mark the closed week as moved. Do not change its fuel charge or settlement. */
async function stampBalanceMoved(
  orgId: string,
  driverId: string,
  week: string,
  movedTo: string,
) {
  const { data: row, error } = await sb()
    .from("driver_financial_periods")
    .select("id, metadata")
    .eq("organization_id", orgId)
    .eq("driver_id", driverId)
    .eq("period_anchor", week)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return;
  const meta = { ...((row.metadata as Record<string, unknown>) || {}) };
  const fc = fcOf(row);
  fc.balanceMovedTo = movedTo;
  meta.financeCore = fc;
  const { error: updErr } = await sb()
    .from("driver_financial_periods")
    .update({ metadata: meta, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (updErr) throw new Error(updErr.message);
}
