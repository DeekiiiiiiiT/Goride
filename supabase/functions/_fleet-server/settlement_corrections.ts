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
  carriedBalanceCorrectionAmount,
  carriedBalanceSentence,
  correctionLinesForSourceWeek,
  fuelShareCorrectionSentence,
  FUEL_SHARE_TOOL_POSTED_ON,
  resolveSealedResidualSettlement,
  sealedRevisionCounts,
  sumCorrectionLines,
  weekExcludedFromCarriedBalance,
  type CorrectionLine,
} from "../../../packages/finance-core/src/fuelShareCorrection.ts";
import { fuelShareDeltaForSourceWeek } from "../../../packages/finance-core/src/movedBalanceCarryCheck.ts";
import { computePeriodSettlement } from "../../../packages/finance-core/src/driverPeriodSettlement.ts";
import { deriveDirectionalSettlementStatus } from "../../../packages/finance-core/src/settlementStatusRepair.ts";
import { round2, toMoneyMinor } from "../../../packages/finance-core/src/money.ts";
import { resolveCarriedBalanceLanding } from "../../../packages/finance-core/src/carriedBalanceLanding.ts";
import { CORRECTIONS_LAND_ON } from "../../../packages/finance-core/src/pastWeeksCleanup.ts";

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
  const landingDriver = driverId || pending[0]?.driverId;
  const landingWeek = await newestOpenWeekAnchor(organizationId, landingDriver);
  return {
    lines: pending,
    net: check.net,
    oct12,
    matchesAudit: check.ok,
    reason: check.reason,
    landingWeek,
  };
}

/** Newest week that is still open. Corrections post onto this week. */
export async function newestOpenWeekAnchor(
  organizationId: string,
  driverId?: string,
): Promise<string | null> {
  let q = sb()
    .from("driver_financial_periods")
    .select("period_anchor, status, closed_at, settlement_status, metadata")
    .eq("organization_id", organizationId)
    .order("period_anchor", { ascending: false });
  if (driverId) q = q.eq("driver_id", driverId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    if (!isPeriodFrozen(periodGateFromRow(row))) return weekOf(row);
  }
  return null;
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

type LandingWeekPeriodRowResult =
  | { ok: true; row: PeriodRow; landingWeek: string; reason: "" }
  | { ok: false; row: null; landingWeek: null; reason: string };

/** Carried balances always land on CORRECTIONS_LAND_ON, not the newest open week. */
async function landingWeekPeriodRow(
  organizationId: string,
  driverId: string,
): Promise<LandingWeekPeriodRowResult> {
  const { data, error } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("period_anchor", CORRECTIONS_LAND_ON)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const resolved = resolveCarriedBalanceLanding({
    landOn: CORRECTIONS_LAND_ON,
    periodAnchor: data ? weekOf(data) : null,
    frozen: data ? isPeriodFrozen(periodGateFromRow(data)) : false,
  });
  if (!resolved.ok) {
    return { ok: false, row: null, landingWeek: null, reason: resolved.reason };
  }
  if (!data) {
    return { ok: false, row: null, landingWeek: null, reason: resolved.reason };
  }
  return { ok: true, row: data, landingWeek: resolved.landingWeek, reason: "" };
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
  const landing = String(preview.landingWeek || "").slice(0, 10);
  if (landing !== CORRECTIONS_LAND_ON) {
    throw new SettlementCommandError(
      "CORRECTIONS_WRONG_WEEK",
      landing
        ? `Corrections have to land on the week of ${CORRECTIONS_LAND_ON}. They would land on ${landing} instead. Nothing was posted.`
        : `Corrections have to land on the week of ${CORRECTIONS_LAND_ON}. There is no open week. Nothing was posted.`,
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

export async function earliestPreFuelRevisionSettlement(
  driverId: string,
  week: string,
): Promise<{ settlement: number | null; createdAt: string | null }> {
  const { data, error } = await sb()
    .from("driver_period_revisions")
    .select("settlement_amount, projection_version, created_at")
    .eq("driver_id", driverId)
    .eq("period_anchor", week)
    .order("projection_version", { ascending: true });
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    const createdAt = row.created_at != null ? String(row.created_at) : null;
    if (!sealedRevisionCounts(createdAt)) continue;
    const v = Number(row.settlement_amount);
    if (Number.isFinite(v)) return { settlement: round2(v), createdAt };
  }
  return { settlement: null, createdAt: null };
}

export type SealedRestorePreviewRow = {
  driverId: string;
  week: string;
  liveAmount: number;
  sealedAmount: number;
  liveStatus: string;
  sealedStatus: string;
};

/** Rows whose live settlement drifts from signedSnapshot (frozen weeks only). */
export async function previewSealedSettlementDrift(
  organizationId: string,
  driverId?: string,
): Promise<SealedRestorePreviewRow[]> {
  let q = sb()
    .from("driver_financial_periods")
    .select("driver_id, period_anchor, settlement_amount, settlement_status, status, closed_at, metadata")
    .eq("organization_id", organizationId);
  if (driverId) q = q.eq("driver_id", driverId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const out: SealedRestorePreviewRow[] = [];
  for (const row of data || []) {
    if (!isPeriodFrozen(periodGateFromRow(row))) continue;
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const snap = meta.signedSnapshot as Record<string, unknown> | undefined;
  if (!snap || typeof snap !== "object") continue;
    const sealedAmount = round2(Number(snap.settlement_amount));
    if (!Number.isFinite(sealedAmount)) continue;
    const liveAmount = round2(Number(row.settlement_amount) || 0);
    const sealedStatus = deriveDirectionalSettlementStatus(sealedAmount);
    const liveStatus = String(row.settlement_status || "");
    if (Math.abs(liveAmount - sealedAmount) <= 0.01 && liveStatus === sealedStatus) continue;
    out.push({
      driverId: String(row.driver_id),
      week: weekOf(row),
      liveAmount,
      sealedAmount,
      liveStatus,
      sealedStatus,
    });
  }
  return out.sort((a, b) => a.week.localeCompare(b.week));
}

/** Restore frozen weeks whose settlement_amount drifted from signedSnapshot. Idempotent. */
export async function restoreSealedSettlementWeeks(
  organizationId: string,
  driverId?: string,
): Promise<{ restored: SealedRestorePreviewRow[] }> {
  const drift = await previewSealedSettlementDrift(organizationId, driverId);
  const restored: SealedRestorePreviewRow[] = [];
  for (const item of drift) {
    const { data: row, error } = await sb()
      .from("driver_financial_periods")
      .select("id, metadata, payout_net, cash_still_held")
      .eq("organization_id", organizationId)
      .eq("driver_id", item.driverId)
      .eq("period_anchor", item.week)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.id) continue;
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const snap = meta.signedSnapshot as Record<string, unknown> | undefined;
    const payoutNet = snap?.payout_net != null
      ? round2(Number(snap.payout_net))
      : round2(Number(row.payout_net) || 0);
    const cashStill = snap?.cash_still_held != null
      ? round2(Number(snap.cash_still_held))
      : round2(Number(row.cash_still_held) || 0);
    const { error: updErr } = await sb()
      .from("driver_financial_periods")
      .update({
        settlement_amount: item.sealedAmount,
        settlement_amount_minor: toMoneyMinor(item.sealedAmount),
        settlement_status: item.sealedStatus,
        payout_net: payoutNet,
        payout_net_minor: toMoneyMinor(payoutNet),
        cash_still_held: cashStill,
        cash_still_held_minor: toMoneyMinor(cashStill),
        payout_status: Math.abs(item.sealedAmount) < 0.01 ? "finalized" : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updErr) throw new Error(updErr.message);
    restored.push(item);
  }
  return { restored };
}

export type CarriedBalancePreviewLine = CorrectionLine & {
  driverId: string;
  sealedResidual: number;
  fuelShareDelta: number;
  wholeCarry: number;
};

function sourceInputFromPeriodRow(row: PeriodRow, landingWeek: string) {
  return {
    periodAnchor: String(row.period_anchor).slice(0, 10),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    balanceMovedTo: landingWeek,
    liveSettlementAmount: Number(row.settlement_amount) || 0,
    driverShare: Number(row.driver_share) || 0,
    fuelDeduction: Number(row.fuel_deduction) || 0,
    cashCollected: Number(row.cash_collected) || 0,
    cashReturned: Number(row.cash_returned) || 0,
    tollChargedToDriver: Number(row.toll_charged_to_driver) || 0,
    tollCashSpend: Number(row.toll_cash_spend) || 0,
    fuelDriverSpend: Number(row.fuel_driver_spend) || 0,
    cashWrittenOff: Number(row.cash_written_off) || 0,
    settlementPaid: Number(row.settlement_paid) || 0,
    tipsPaidToDriver: Number(row.tips_paid_to_driver) || 0,
  };
}

function landingSettlementAfterLines(open: PeriodRow, lines: CorrectionLine[]): number {
  const meta = (open.metadata || {}) as Record<string, unknown>;
  const fc = { ...((meta.financeCore as Record<string, unknown>) || {}) };
  const hasWashMeta =
    fc.tollCashWashEligible != null && Number.isFinite(Number(fc.tollCashWashEligible));
  const tollCashWash = round2(
    Math.max(
      0,
      hasWashMeta ? Number(fc.tollCashWashEligible) : Number(open.toll_cash_spend) || 0,
    ),
  );
  return computePeriodSettlement({
    driverShare: Number(open.driver_share) || 0,
    fuelDeduction: Number(open.fuel_deduction) || 0,
    baseCashOwed: Number(open.cash_collected) || 0,
    baseCashPaid: Number(open.cash_returned) || 0,
    tollCashWash,
    tollPersonal: Number(open.toll_charged_to_driver) || 0,
    fuelCredits: Number(open.fuel_driver_spend) || 0,
    cashWrittenOff: Number(open.cash_written_off) || 0,
    settlementPaid: Number(open.settlement_paid) || 0,
    tipsPaidToDriver: Number(open.tips_paid_to_driver) || 0,
    openingCashCustody: round2(Math.max(0, Number(fc.openingCashCustody) || 0)),
    postedAdjustments: sumCorrectionLines(lines),
  }).settlement;
}

export async function previewCarriedBalanceCorrections(
  organizationId: string,
  driverId?: string,
) {
  let q = sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", organizationId);
  if (driverId) q = q.eq("driver_id", driverId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const movedRows = (data || []).filter((row) => {
    const moved = String(fcOf(row).balanceMovedTo || "").slice(0, 10);
    return moved === CORRECTIONS_LAND_ON;
  });

  const drift = await previewSealedSettlementDrift(organizationId, driverId);
  const lines: CarriedBalancePreviewLine[] = [];
  const openByDriver = new Map<string, PeriodRow>();

  for (const row of movedRows) {
    const fcRow = fcOf(row);
    if (weekExcludedFromCarriedBalance(fcRow as { legacyCleanup?: unknown })) continue;
    const id = String(row.driver_id);
    const week = weekOf(row);
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const projectedAt = row.projected_at != null ? String(row.projected_at) : null;
    const liveSettlement = Number(row.settlement_amount) || 0;
    const projectedDay = String(projectedAt || "").slice(0, 10);
    const preFuelToolSettlement =
      /^\d{4}-\d{2}-\d{2}$/.test(projectedDay) && projectedDay < FUEL_SHARE_TOOL_POSTED_ON
        ? liveSettlement
        : null;
    const { settlement: earliest, createdAt: revisionCreatedAt } = await earliestPreFuelRevisionSettlement(
      id,
      week,
    );
    const sealed = resolveSealedResidualSettlement({
      metadata: meta,
      liveSettlementAmount: liveSettlement,
      balanceMovedTo: CORRECTIONS_LAND_ON,
      earliestRevisionSettlement: earliest,
      revisionCreatedAt,
      preFuelToolSettlement,
      projectedAt,
    });
    if (!Number.isFinite(sealed)) continue;
    if (Math.abs(sealed) <= 0.01) continue;

    let open = openByDriver.get(id);
    if (!open) {
      const landing = await landingWeekPeriodRow(organizationId, id);
      if (!landing.ok) {
        return {
          lines: [],
          drift,
          landingWeek: null,
          newPostedAdjustments: null,
          expectedLandingSettlement: null,
          reason: landing.reason,
        };
      }
      open = landing.row;
      openByDriver.set(id, open);
    }
    const openFc = fcOf(open);
    const openLines = Array.isArray(openFc.correctionLines)
      ? (openFc.correctionLines as CorrectionLine[])
      : [];
    if (openLines.some((line) => line.kind === "carried_balance" && String(line.sourceWeek).slice(0, 10) === week)) {
      continue;
    }
    const fuelDelta = fuelShareDeltaForSourceWeek(
      week,
      openLines,
      sourceInputFromPeriodRow(row, CORRECTIONS_LAND_ON),
      sealed,
    );
    const existingForWeek = correctionLinesForSourceWeek(openLines, week);
    const amount = carriedBalanceCorrectionAmount(sealed, fuelDelta, existingForWeek);
    if (Math.abs(amount) <= 0.01) continue;
    lines.push({
      driverId: id,
      sourceWeek: week,
      amount,
      sentence: carriedBalanceSentence({ week, amount }),
      kind: "carried_balance",
      sealedResidual: sealed,
      fuelShareDelta: fuelDelta,
      wholeCarry: round2(sealed + fuelDelta),
    });
  }

  const landingDriver = driverId || lines[0]?.driverId;
  let landingWeek: string | null = null;
  if (landingDriver) {
    if (openByDriver.has(landingDriver)) {
      landingWeek = weekOf(openByDriver.get(landingDriver)!);
    } else {
      const landing = await landingWeekPeriodRow(organizationId, landingDriver);
      landingWeek = landing.ok ? landing.landingWeek : null;
    }
  }
  let newPostedAdjustments: number | null = null;
  let expectedLandingSettlement: number | null = null;
  if (landingDriver && openByDriver.has(landingDriver)) {
    const open = openByDriver.get(landingDriver)!;
    const openFc = fcOf(open);
    const baseLines = Array.isArray(openFc.correctionLines)
      ? [...(openFc.correctionLines as CorrectionLine[])]
      : [];
    const merged = [...baseLines];
    const have = new Set(merged.map((l) => `${l.kind}:${l.sourceWeek}`));
    for (const line of lines.filter((l) => l.driverId === landingDriver)) {
      const key = `${line.kind}:${line.sourceWeek}`;
      if (have.has(key)) continue;
      merged.push(line);
      have.add(key);
    }
    newPostedAdjustments = sumCorrectionLines(merged);
    expectedLandingSettlement = landingSettlementAfterLines(open, merged);
  }

  return {
    lines,
    drift,
    landingWeek,
    newPostedAdjustments,
    expectedLandingSettlement,
    currentLandingSettlement: landingDriver && openByDriver.has(landingDriver)
      ? round2(Number(openByDriver.get(landingDriver)!.settlement_amount) || 0)
      : null,
    reason: landingWeek === CORRECTIONS_LAND_ON ? "" : `Carried balances must land on the week of ${CORRECTIONS_LAND_ON}.`,
  };
}

export async function applyCarriedBalanceCorrections(opts: {
  organizationId: string;
  driverId?: string;
  actorId?: string | null;
  confirm: boolean;
}) {
  const preview = await previewCarriedBalanceCorrections(opts.organizationId, opts.driverId);
  if (!opts.confirm) {
    return { preview: true, ...preview, applied: false, restored: [] as SealedRestorePreviewRow[] };
  }
  if (String(preview.landingWeek || "").slice(0, 10) !== CORRECTIONS_LAND_ON) {
    throw new SettlementCommandError(
      "CARRIED_BALANCE_WRONG_WEEK",
      preview.reason || `Carried balances must land on the week of ${CORRECTIONS_LAND_ON}. Nothing was posted.`,
      409,
    );
  }

  const { restored } = await restoreSealedSettlementWeeks(opts.organizationId, opts.driverId);

  const byDriver = new Map<string, CarriedBalancePreviewLine[]>();
  for (const line of preview.lines) {
    const list = byDriver.get(line.driverId) || [];
    list.push(line);
    byDriver.set(line.driverId, list);
  }

  for (const [driverId, lines] of byDriver) {
    const landing = await landingWeekPeriodRow(opts.organizationId, driverId);
    if (!landing.ok) {
      throw new SettlementCommandError(
        "CARRIED_BALANCE_WRONG_WEEK",
        `${landing.reason} Nothing was posted.`,
        409,
      );
    }
    const open = landing.row;
    const openAnchor = weekOf(open);
    const meta = { ...((open.metadata as Record<string, unknown>) || {}) };
    const fc = fcOf(open);
    const existing = Array.isArray(fc.correctionLines)
      ? (fc.correctionLines as CorrectionLine[])
      : [];
    const have = new Set(existing.map((l) => `${l.kind}:${l.sourceWeek}`));

    for (const line of lines) {
      const key = `${line.kind}:${line.sourceWeek}`;
      if (have.has(key)) continue;
      existing.push({
        sourceWeek: line.sourceWeek,
        amount: line.amount,
        sentence: line.sentence,
        kind: "carried_balance",
      });
      have.add(key);
      const idempotencyKey = `carried-balance-correction:${driverId}:${line.sourceWeek}`;
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
          metadata: { sourceWeek: line.sourceWeek, backfill: true, carriedBalance: true },
        });
        const { error: insErr } = await sb().from("settlement_movements").insert(row);
        if (insErr && !/duplicate|unique/i.test(insErr.message || "")) throw new Error(insErr.message);
      }
    }

    fc.correctionLines = existing;
    fc.postedAdjustments = sumCorrectionLines(existing);
    meta.financeCore = fc;
    await persistPeriodRowWithVersion(driverId, openAnchor, {
      metadata: meta,
      updated_at: new Date().toISOString(),
    });
    await syncPeriodCashFromTransactions(driverId, openAnchor);
  }

  return { preview: false, ...preview, applied: true, restored };
}
