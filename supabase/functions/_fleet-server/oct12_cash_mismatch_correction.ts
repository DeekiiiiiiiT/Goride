/**
 * §1.5 — optional +3,201.27 correction when Uber cash report matches trip sum
 * (19,269.38) rather than the ledger statement (22,470.65). Posts to the open
 * week (Oct 19). Idempotent. Do not run unless the owner confirms Uber agrees
 * with the trip sum.
 */
import { getServiceClient } from "./service_client.ts";
import { sumCorrectionLines, type CorrectionLine } from "../../../packages/finance-core/src/fuelShareCorrection.ts";
import { persistPeriodRowWithVersion } from "./period_persist.ts";
import { isPeriodFrozen, periodGateFromRow } from "./settlement_period_freeze.ts";

export const OCT12_CASH_MISMATCH_AMOUNT = 3201.27;
export const OCT12_CASH_MISMATCH_SOURCE_WEEK = "2026-10-12";
export const OCT12_CASH_MISMATCH_KEY = "oct12-cash-source-mismatch-3201.27";

export async function postOct12CashMismatchCorrection(opts: {
  organizationId: string;
  driverId: string;
  actorId?: string | null;
  /** Must be true — refuses otherwise. */
  confirm: boolean;
}): Promise<{
  posted: boolean;
  openWeek: string | null;
  postedAdjustments: number | null;
  reason: string;
}> {
  if (!opts.confirm) {
    return {
      posted: false,
      openWeek: null,
      postedAdjustments: null,
      reason: "confirm=true required — owner must verify Uber cash report equals trip sum 19,269.38",
    };
  }

  const sb = getServiceClient();
  const { data: rows, error } = await sb
    .from("driver_financial_periods")
    .select("id, period_anchor, metadata, status, closed_at, settlement_status")
    .eq("organization_id", opts.organizationId)
    .eq("driver_id", opts.driverId)
    .order("period_anchor", { ascending: false });
  if (error) throw new Error(error.message);

  const open = (rows || []).find((row) => !isPeriodFrozen(periodGateFromRow(row)));
  if (!open) {
    return { posted: false, openWeek: null, postedAdjustments: null, reason: "NO_OPEN_WEEK" };
  }

  const openWeek = String(open.period_anchor).slice(0, 10);
  const meta = { ...((open.metadata || {}) as Record<string, unknown>) };
  const fc = { ...((meta.financeCore || {}) as Record<string, unknown>) };
  const existing = Array.isArray(fc.correctionLines)
    ? [...(fc.correctionLines as CorrectionLine[])]
    : [];

  if (
    existing.some(
      (line) =>
        String(line.sourceWeek).slice(0, 10) === OCT12_CASH_MISMATCH_SOURCE_WEEK &&
        Math.abs((Number(line.amount) || 0) - OCT12_CASH_MISMATCH_AMOUNT) < 0.01 &&
        String((line as { sentence?: string }).sentence || "").includes("cash source mismatch"),
    )
  ) {
    return {
      posted: false,
      openWeek,
      postedAdjustments: sumCorrectionLines(existing),
      reason: "already_posted",
    };
  }

  const sentence =
    `Week of ${OCT12_CASH_MISMATCH_SOURCE_WEEK}: Uber cash report matched trip sum, ` +
    `not statement. Cash held was overstated by $${OCT12_CASH_MISMATCH_AMOUNT.toFixed(2)} ` +
    `(cash source mismatch). Company owes $${OCT12_CASH_MISMATCH_AMOUNT.toFixed(2)}.`;

  existing.push({
    sourceWeek: OCT12_CASH_MISMATCH_SOURCE_WEEK,
    amount: OCT12_CASH_MISMATCH_AMOUNT,
    sentence,
    kind: "legacy_balance",
  });
  fc.correctionLines = existing;
  fc.postedAdjustments = sumCorrectionLines(existing);
  meta.financeCore = fc;

  await persistPeriodRowWithVersion(opts.driverId, openWeek, { metadata: meta });

  return {
    posted: true,
    openWeek,
    postedAdjustments: Number(fc.postedAdjustments) || 0,
    reason: "posted",
  };
}
