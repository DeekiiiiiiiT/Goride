/**
 * Dec 2025–Jan 12 2026 is not recalculated.
 * Carry moves the stored balance onto the open week. Write-off leaves it off the desk.
 */
import { getServiceClient } from "./service_client.ts";
import { persistPeriodRowWithVersion } from "./period_persist.ts";
import { syncPeriodCashFromTransactions } from "./driver_financial_periods.ts";
import { buildMovementRow, SettlementCommandError } from "./settlement_commands.ts";
import { isPeriodFrozen, periodGateFromRow } from "./settlement_period_freeze.ts";
import type { CorrectionLine } from "../../../packages/finance-core/src/fuelShareCorrection.ts";
import { sumCorrectionLines } from "../../../packages/finance-core/src/fuelShareCorrection.ts";
import {
  CORRECTIONS_LAND_ON,
  LEGACY_KEPT_REPAIR_WEEKS,
  WRITE_OFF_REASON_MIN,
  legacyKeptHalf,
  splitLegacyWriteOff,
} from "../../../packages/finance-core/src/pastWeeksCleanup.ts";

const THROUGH = "2026-01-12";

function sb() {
  return getServiceClient();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type LegacyChoice = {
  week: string;
  action: "carry" | "write_off";
  reason?: string;
  /** Positive size to drop. Required for a write-off. A missing amount is refused. */
  amount?: number;
};

export async function previewLegacyWeeks(orgId: string, driverId?: string) {
  let q = sb()
    .from("driver_financial_periods")
    .select("id, driver_id, period_anchor, settlement_amount, status, closed_at, metadata, settlement_status")
    .eq("organization_id", orgId)
    .lte("period_anchor", THROUGH)
    .order("period_anchor", { ascending: true });
  if (driverId) q = q.eq("driver_id", driverId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const weeks = (data || [])
    .filter((row) => {
      const fc = (row.metadata as { financeCore?: { legacyCleanup?: unknown } } | null)?.financeCore;
      return !fc?.legacyCleanup;
    })
    .map((row) => ({
      week: String(row.period_anchor).slice(0, 10),
      driverId: String(row.driver_id),
      amount: round2(Number(row.settlement_amount) || 0),
      closed: isPeriodFrozen(periodGateFromRow(row)),
      defaultAction: "carry" as const,
    }));
  return { weeks, net: round2(weeks.reduce((s, w) => s + w.amount, 0)) };
}

export async function applyLegacyChoices(opts: {
  organizationId: string;
  driverId?: string;
  actorId: string;
  confirm: boolean;
  choices?: LegacyChoice[];
}) {
  const preview = await previewLegacyWeeks(opts.organizationId, opts.driverId);
  if (!opts.confirm) return { ...preview, posted: false };
  for (const choice of opts.choices || []) {
    if (choice.action !== "write_off") continue;
    if (choice.amount == null || !Number.isFinite(Number(choice.amount))) {
      throw new SettlementCommandError(
        "WRITE_OFF_AMOUNT_REQUIRED",
        `Week of ${choice.week || "unknown"} needs an amount to write off. Nothing was posted.`,
        400,
      );
    }
  }
  const choiceByWeek = new Map((opts.choices || []).map((c) => [`${c.week}`, c]));
  for (const week of preview.weeks) {
    const choice = choiceByWeek.get(week.week) || { week: week.week, action: "carry" as const };
    if (choice.action !== "write_off") continue;
    const full = Math.abs(week.amount);
    if (choice.amount == null || !Number.isFinite(Number(choice.amount))) {
      throw new SettlementCommandError(
        "WRITE_OFF_AMOUNT_REQUIRED",
        `Week of ${week.week} needs an amount to write off. Nothing was posted.`,
        400,
      );
    }
    const requested = round2(Number(choice.amount));
    if (requested <= 0.005) {
      throw new SettlementCommandError(
        "WRITE_OFF_AMOUNT_REQUIRED",
        `Week of ${week.week} needs an amount to write off. Nothing was posted.`,
        400,
      );
    }
    if (requested > full + 0.01) {
      throw new SettlementCommandError(
        "WRITE_OFF_AMOUNT_TOO_BIG",
        `Week of ${week.week} can only write off up to $${full.toFixed(2)}. Nothing was posted.`,
        400,
      );
    }
    if (String(choice.reason || "").trim().length < WRITE_OFF_REASON_MIN) {
      throw new SettlementCommandError(
        "WRITE_OFF_REASON_REQUIRED",
        `Week of ${week.week} needs a short reason. Nothing was posted.`,
        400,
      );
    }
  }

  const byDriver = new Map<string, typeof preview.weeks>();
  for (const week of preview.weeks) {
    const list = byDriver.get(week.driverId) || [];
    list.push(week);
    byDriver.set(week.driverId, list);
  }

  for (const [driverId, weeks] of byDriver) {
    const { data: openRows } = await sb()
      .from("driver_financial_periods")
      .select("id, period_anchor, metadata, status, closed_at, settlement_status")
      .eq("organization_id", opts.organizationId)
      .eq("driver_id", driverId)
      .order("period_anchor", { ascending: false });
    const open = (openRows || []).find((row) => !isPeriodFrozen(periodGateFromRow(row)));
    if (!open) throw new Error("NO_OPEN_WEEK");
    const meta = (open.metadata || {}) as Record<string, unknown>;
    const fc = { ...((meta.financeCore || {}) as Record<string, unknown>) };
    const lines = Array.isArray(fc.correctionLines) ? [...(fc.correctionLines as CorrectionLine[])] : [];

    for (const week of weeks) {
      const choice = choiceByWeek.get(week.week) || { week: week.week, action: "carry" as const };
      const split = choice.action === "write_off"
        ? splitLegacyWriteOff(week.amount, Number(choice.amount))
        : { writeOff: 0, keep: week.amount };
      const openAnchor = String(open.period_anchor).slice(0, 10);
      if (Math.abs(split.keep) > 0.01) {
        const sentence = split.keep >= 0
          ? `Week of ${week.week}: older balance the company still owes $${split.keep.toFixed(2)}.`
          : `Week of ${week.week}: older balance he still owes $${Math.abs(split.keep).toFixed(2)}.`;
        lines.push({ sourceWeek: week.week, amount: split.keep, sentence, kind: "legacy_balance" });
        const idempotencyKey = `legacy-balance:${driverId}:${week.week}`;
        const { error } = await sb().from("settlement_movements").insert(
          buildMovementRow({
            organizationId: opts.organizationId,
            driverId,
            periodAnchor: openAnchor,
            kind: "correction",
            amountMinor: Math.round(split.keep * 100),
            idempotencyKey,
            actorId: opts.actorId,
            reason: sentence,
            metadata: { sourceWeek: week.week, legacy: true, writeOff: split.writeOff },
          }),
        );
        if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
      }
      const { data: source } = await sb()
        .from("driver_financial_periods")
        .select("id, metadata, status, closed_at")
        .eq("organization_id", opts.organizationId)
        .eq("driver_id", driverId)
        .eq("period_anchor", week.week)
        .maybeSingle();
      if (!source?.id) continue;
      const sourceMeta = { ...((source.metadata || {}) as Record<string, unknown>) };
      const sourceFc = { ...((sourceMeta.financeCore || {}) as Record<string, unknown>) };
      const fullyWrittenOff = choice.action === "write_off" && Math.abs(split.keep) <= 0.01;
      sourceFc.legacyCleanup = fullyWrittenOff ? "written_off" : "carried";
      sourceFc.legacyReason = choice.reason || null;
      sourceFc.legacyWriteOffAmount = split.writeOff > 0.01 ? split.writeOff : null;
      sourceFc.legacyKeptAmount = Math.abs(split.keep) > 0.01 ? split.keep : null;
      sourceFc.balanceMovedTo = Math.abs(split.keep) > 0.01 ? openAnchor : null;
      sourceMeta.financeCore = sourceFc;
      await sb().from("driver_financial_periods").update({
        metadata: sourceMeta,
        status: source.status === "closed" ? "closed" : "closed",
        closed_at: source.closed_at || new Date().toISOString(),
      }).eq("id", source.id);
    }

    fc.correctionLines = lines;
    fc.postedAdjustments = sumCorrectionLines(lines);
    meta.financeCore = fc;
    const openAnchor = String(open.period_anchor).slice(0, 10);
    await persistPeriodRowWithVersion(driverId, openAnchor, { metadata: meta });
    await syncPeriodCashFromTransactions(driverId, openAnchor);
  }
  return { ...preview, posted: true };
}

function financeCoreOf(row: { metadata?: unknown }): Record<string, unknown> {
  const meta = (row.metadata || {}) as Record<string, unknown>;
  return { ...((meta.financeCore as Record<string, unknown>) || {}) };
}

async function newestOpenAnchor(orgId: string, driverId: string): Promise<string | null> {
  const { data, error } = await sb()
    .from("driver_financial_periods")
    .select("period_anchor, status, closed_at, settlement_status, metadata")
    .eq("organization_id", orgId)
    .eq("driver_id", driverId)
    .order("period_anchor", { ascending: false });
  if (error) throw new Error(error.message);
  const open = (data || []).find((row) => !isPeriodFrozen(periodGateFromRow(row)));
  return open ? String(open.period_anchor).slice(0, 10) : null;
}

export type LegacyKeptRepairPreview = {
  available: boolean;
  canRestore: boolean;
  driverId: string;
  openWeek: string | null;
  weeks: Array<{ week: string; balance: number; keep: number }>;
  net: number;
  reason: string | null;
};

/** Dec 29 and Jan 12 only. Hidden once the kept half is stored or the full write-off is confirmed. */
export async function previewLegacyKeptRepair(
  orgId: string,
  driverId?: string,
): Promise<LegacyKeptRepairPreview> {
  const weeks = LEGACY_KEPT_REPAIR_WEEKS.map((row) => ({
    week: row.week,
    balance: row.balance,
    keep: legacyKeptHalf(row.balance),
  }));
  const net = round2(weeks.reduce((sum, week) => sum + week.keep, 0));
  const hidden = (found = driverId || ""): LegacyKeptRepairPreview => ({
    available: false,
    canRestore: false,
    driverId: found,
    openWeek: null,
    weeks,
    net,
    reason: null,
  });

  let q = sb()
    .from("driver_financial_periods")
    .select("id, driver_id, period_anchor, settlement_amount, metadata")
    .eq("organization_id", orgId)
    .in("period_anchor", weeks.map((week) => week.week));
  if (driverId) q = q.eq("driver_id", driverId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data || [];
  const driverIds = [...new Set(rows.map((row) => String(row.driver_id)))];
  if (driverIds.length !== 1 || rows.length < weeks.length) return hidden(driverIds[0] || "");
  const foundDriver = driverIds[0];

  for (const spec of weeks) {
    const row = rows.find((item) => String(item.period_anchor).slice(0, 10) === spec.week);
    if (!row) return hidden(foundDriver);
    const amount = round2(Number(row.settlement_amount) || 0);
    if (Math.abs(amount - spec.balance) > 0.001) return hidden(foundDriver);
    const fc = financeCoreOf(row);
    if (fc.legacyCleanup !== "written_off") return hidden(foundDriver);
    if (fc.legacyKeptConfirmed === "full_write_off") return hidden(foundDriver);
    if (fc.legacyKeptAmount != null) return hidden(foundDriver);
    const { data: movement, error: movErr } = await sb()
      .from("settlement_movements")
      .select("id, amount_minor")
      .eq("organization_id", orgId)
      .eq("idempotency_key", `legacy-balance:${foundDriver}:${spec.week}`)
      .maybeSingle();
    if (movErr) throw new Error(movErr.message);
    if (movement && Number(movement.amount_minor) !== Math.round(spec.keep * 100)) return hidden(foundDriver);
  }

  const openWeek = await newestOpenAnchor(orgId, foundDriver);
  const canRestore = openWeek === CORRECTIONS_LAND_ON;
  return {
    available: true,
    canRestore,
    driverId: foundDriver,
    openWeek,
    weeks,
    net,
    reason: canRestore
      ? null
      : `The halves have to land on the week of ${CORRECTIONS_LAND_ON}.`,
  };
}

export async function applyLegacyKeptRepair(opts: {
  organizationId: string;
  driverId?: string;
  actorId: string;
  confirm: boolean;
  action: "restore" | "leave";
}) {
  const preview = await previewLegacyKeptRepair(opts.organizationId, opts.driverId);
  if (!opts.confirm) return { ...preview, posted: false };
  if (!preview.available) {
    throw new SettlementCommandError(
      "KEPT_REPAIR_UNAVAILABLE",
      "Those two weeks are not waiting on this repair. Nothing was posted.",
      409,
    );
  }
  const driverId = preview.driverId;

  if (opts.action === "leave") {
    for (const week of preview.weeks) {
      const { data: source, error } = await sb()
        .from("driver_financial_periods")
        .select("id, metadata")
        .eq("organization_id", opts.organizationId)
        .eq("driver_id", driverId)
        .eq("period_anchor", week.week)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!source?.id) {
        throw new SettlementCommandError("KEPT_REPAIR_UNAVAILABLE", "A half week is missing. Nothing was posted.", 409);
      }
      const sourceMeta = { ...((source.metadata || {}) as Record<string, unknown>) };
      const sourceFc = financeCoreOf(source);
      sourceFc.legacyKeptAmount = 0;
      sourceFc.legacyKeptConfirmed = "full_write_off";
      sourceMeta.financeCore = sourceFc;
      const { error: updErr } = await sb()
        .from("driver_financial_periods")
        .update({ metadata: sourceMeta })
        .eq("id", source.id);
      if (updErr) throw new Error(updErr.message);
    }
    return { ...preview, available: false, posted: false, confirmedFullWriteOff: true };
  }

  if (!preview.canRestore || preview.openWeek !== CORRECTIONS_LAND_ON) {
    throw new SettlementCommandError(
      "KEPT_REPAIR_WRONG_WEEK",
      preview.reason || `The halves have to land on the week of ${CORRECTIONS_LAND_ON}. Nothing was posted.`,
      409,
    );
  }

  const { data: openRows, error: openErr } = await sb()
    .from("driver_financial_periods")
    .select("id, period_anchor, metadata")
    .eq("organization_id", opts.organizationId)
    .eq("driver_id", driverId)
    .eq("period_anchor", CORRECTIONS_LAND_ON)
    .maybeSingle();
  if (openErr) throw new Error(openErr.message);
  if (!openRows?.id) {
    throw new SettlementCommandError("NO_OPEN_WEEK", "The open week is missing. Nothing was posted.", 409);
  }
  const meta = { ...((openRows.metadata || {}) as Record<string, unknown>) };
  const fc = financeCoreOf(openRows);
  const lines = Array.isArray(fc.correctionLines) ? [...(fc.correctionLines as CorrectionLine[])] : [];

  for (const week of preview.weeks) {
    const sentence = week.keep >= 0
      ? `Week of ${week.week}: older balance the company still owes $${week.keep.toFixed(2)}.`
      : `Week of ${week.week}: older balance he still owes $${Math.abs(week.keep).toFixed(2)}.`;
    if (!lines.some((line) => line.kind === "legacy_balance" && line.sourceWeek === week.week)) {
      lines.push({ sourceWeek: week.week, amount: week.keep, sentence, kind: "legacy_balance" });
    }
    const idempotencyKey = `legacy-balance:${driverId}:${week.week}`;
    const { data: prior, error: priorErr } = await sb()
      .from("settlement_movements")
      .select("id")
      .eq("organization_id", opts.organizationId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (priorErr) throw new Error(priorErr.message);
    if (!prior) {
      const { error } = await sb().from("settlement_movements").insert(
        buildMovementRow({
          organizationId: opts.organizationId,
          driverId,
          periodAnchor: CORRECTIONS_LAND_ON,
          kind: "correction",
          amountMinor: Math.round(week.keep * 100),
          idempotencyKey,
          actorId: opts.actorId,
          reason: sentence,
          metadata: { sourceWeek: week.week, legacy: true, keptRepair: true },
        }),
      );
      if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    }

    const { data: source, error: sourceErr } = await sb()
      .from("driver_financial_periods")
      .select("id, metadata")
      .eq("organization_id", opts.organizationId)
      .eq("driver_id", driverId)
      .eq("period_anchor", week.week)
      .maybeSingle();
    if (sourceErr) throw new Error(sourceErr.message);
    if (!source?.id) continue;
    const sourceMeta = { ...((source.metadata || {}) as Record<string, unknown>) };
    const sourceFc = financeCoreOf(source);
    sourceFc.legacyCleanup = "written_off";
    sourceFc.legacyKeptAmount = week.keep;
    sourceFc.balanceMovedTo = CORRECTIONS_LAND_ON;
    sourceMeta.financeCore = sourceFc;
    const { error: updErr } = await sb()
      .from("driver_financial_periods")
      .update({ metadata: sourceMeta })
      .eq("id", source.id);
    if (updErr) throw new Error(updErr.message);
  }

  fc.correctionLines = lines;
  fc.postedAdjustments = sumCorrectionLines(lines);
  meta.financeCore = fc;
  await persistPeriodRowWithVersion(driverId, CORRECTIONS_LAND_ON, { metadata: meta });
  await syncPeriodCashFromTransactions(driverId, CORRECTIONS_LAND_ON);
  return { ...preview, available: false, posted: true };
}
