/**
 * Dec 2025–Jan 12 2026 is not recalculated.
 * Carry moves the stored balance onto the open week. Write-off leaves it off the desk.
 */
import { getServiceClient } from "./service_client.ts";
import { persistPeriodRowWithVersion } from "./period_persist.ts";
import { syncPeriodCashFromTransactions } from "./driver_financial_periods.ts";
import { buildMovementRow } from "./settlement_commands.ts";
import { isPeriodFrozen, periodGateFromRow } from "./settlement_period_freeze.ts";
import type { CorrectionLine } from "../../../packages/finance-core/src/fuelShareCorrection.ts";
import { sumCorrectionLines } from "../../../packages/finance-core/src/fuelShareCorrection.ts";

const THROUGH = "2026-01-12";

function sb() {
  return getServiceClient();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type LegacyChoice = { week: string; action: "carry" | "write_off"; reason?: string };

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
  const choiceByWeek = new Map((opts.choices || []).map((c) => [`${c.week}`, c]));
  for (const week of preview.weeks) {
    const choice = choiceByWeek.get(week.week) || { week: week.week, action: "carry" as const };
    if (choice.action === "write_off" && String(choice.reason || "").trim().length < 8) {
      throw new Error(`WRITE_OFF_REASON: week of ${week.week} needs a reason`);
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
      if (choice.action === "carry" && Math.abs(week.amount) > 0.01) {
        const sentence = week.amount >= 0
          ? `Week of ${week.week}: older balance the company still owes $${week.amount.toFixed(2)}.`
          : `Week of ${week.week}: older balance he still owes $${Math.abs(week.amount).toFixed(2)}.`;
        lines.push({ sourceWeek: week.week, amount: week.amount, sentence, kind: "legacy_balance" });
        const idempotencyKey = `legacy-balance:${driverId}:${week.week}`;
        const { error } = await sb().from("settlement_movements").insert(
          buildMovementRow({
            organizationId: opts.organizationId,
            driverId,
            periodAnchor: String(open.period_anchor).slice(0, 10),
            kind: "correction",
            amountMinor: Math.round(week.amount * 100),
            idempotencyKey,
            actorId: opts.actorId,
            reason: sentence,
            metadata: { sourceWeek: week.week, legacy: true },
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
      sourceFc.legacyCleanup = choice.action === "write_off" ? "written_off" : "carried";
      sourceFc.legacyReason = choice.reason || null;
      sourceFc.balanceMovedTo = choice.action === "carry" ? String(open.period_anchor).slice(0, 10) : null;
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
