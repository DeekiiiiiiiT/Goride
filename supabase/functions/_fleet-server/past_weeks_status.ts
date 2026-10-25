/**
 * One read for the settlements banner. Does not return correction lines.
 * Later steps are not computed until the earlier ones are done.
 */
import { PAST_WEEKS_CLOSE, resolvePastWeeksStep } from "../../../packages/finance-core/src/pastWeeksCleanup.ts";
import { previewLegacyKeptRepair, previewLegacyWeeks } from "./legacy_weeks.ts";
import { payoutKeysPosted } from "./settlement_payout_backfill.ts";
import { previewFuelShareCorrections } from "./settlement_corrections.ts";
import { isPeriodFrozen, periodGateFromRow } from "./settlement_period_freeze.ts";
import { getServiceClient } from "./service_client.ts";

const CLOSE_WEEKS = [...PAST_WEEKS_CLOSE];

function sb() {
  return getServiceClient();
}

export type PastWeeksCleanupStatus = {
  applicable: boolean;
  driverId: string;
  step: 1 | 2 | 3 | 4 | "done";
  complete: boolean;
  alreadyPosted: boolean;
  nextCloseWeek: string | null;
  /** Sep 7–Oct 5 weeks that are still open, in close order. Same rule as the step. */
  openCloseWeeks: string[];
  landingWeek: string | null;
  /** Present only on the server that refuses a write-off with no amount. */
  partialWriteOff: true;
  keptRepair: {
    driverId: string;
    canRestore: boolean;
    openWeek: string | null;
    weeks: Array<{ week: string; balance: number; keep: number }>;
    net: number;
    reason: string | null;
  } | null;
};

async function hasCleanupHistory(orgId: string): Promise<boolean> {
  const { count, error } = await sb()
    .from("driver_financial_periods")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("period_anchor", "2025-12-01")
    .lte("period_anchor", "2026-10-12");
  if (error) throw new Error(error.message);
  return (count || 0) > 0;
}

async function openCloseWeeks(orgId: string): Promise<string[]> {
  const { data, error } = await sb()
    .from("driver_financial_periods")
    .select("period_anchor, status, closed_at, settlement_status, metadata")
    .eq("organization_id", orgId)
    .in("period_anchor", CLOSE_WEEKS);
  if (error) throw new Error(error.message);
  const byWeek = new Map<string, Array<Record<string, unknown>>>();
  for (const row of data || []) {
    const week = String(row.period_anchor).slice(0, 10);
    const list = byWeek.get(week) || [];
    list.push(row as Record<string, unknown>);
    byWeek.set(week, list);
  }
  return CLOSE_WEEKS.filter((week) => {
    const rows = byWeek.get(week) || [];
    if (rows.length === 0) return true;
    return rows.some((row) => !isPeriodFrozen(periodGateFromRow(row)));
  });
}

async function findDriver(orgId: string): Promise<string> {
  const { data, error } = await sb()
    .from("driver_financial_periods")
    .select("driver_id")
    .eq("organization_id", orgId)
    .gte("period_anchor", "2025-12-01")
    .lte("period_anchor", "2026-10-12")
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.driver_id ? String(data[0].driver_id) : "";
}

function status(
  partial: Omit<PastWeeksCleanupStatus, "partialWriteOff" | "keptRepair">,
  keptRepair: PastWeeksCleanupStatus["keptRepair"],
): PastWeeksCleanupStatus {
  return { ...partial, partialWriteOff: true, keptRepair };
}

export async function pastWeeksCleanupStatus(orgId: string): Promise<PastWeeksCleanupStatus> {
  const repair = await previewLegacyKeptRepair(orgId);
  const keptRepair = repair.available
    ? {
      driverId: repair.driverId,
      canRestore: repair.canRestore,
      openWeek: repair.openWeek,
      weeks: repair.weeks,
      net: repair.net,
      reason: repair.reason,
    }
    : null;

  if (!(await hasCleanupHistory(orgId))) {
    return status({
      applicable: false,
      driverId: "",
      step: "done",
      complete: true,
      alreadyPosted: false,
      nextCloseWeek: null,
      openCloseWeeks: [],
      landingWeek: null,
    }, keptRepair);
  }

  const legacy = await previewLegacyWeeks(orgId);
  let driverId = legacy.weeks[0]?.driverId || "";
  if (legacy.weeks.length > 0) {
    return status({
      applicable: true,
      driverId,
      step: 1,
      complete: false,
      alreadyPosted: false,
      nextCloseWeek: null,
      openCloseWeeks: [],
      landingWeek: null,
    }, keptRepair);
  }

  const openWeeks = await openCloseWeeks(orgId);
  if (!driverId) driverId = await findDriver(orgId);
  if (openWeeks.length > 0) {
    return status({
      applicable: true,
      driverId,
      step: 2,
      complete: false,
      alreadyPosted: false,
      nextCloseWeek: openWeeks[0],
      openCloseWeeks: openWeeks,
      landingWeek: null,
    }, keptRepair);
  }

  const corrections = await previewFuelShareCorrections(orgId, driverId || undefined);
  driverId = (corrections.lines[0] as { driverId?: string } | undefined)?.driverId || driverId;
  const correctionsPending = corrections.lines.length > 0 || Boolean(corrections.oct12);
  if (correctionsPending) {
    return status({
      applicable: true,
      driverId,
      step: resolvePastWeeksStep({
        legacyRemaining: 0,
        closeWeeksOpen: 0,
        correctionsPending: true,
        payoutsPosted: false,
      }),
      complete: false,
      alreadyPosted: false,
      nextCloseWeek: null,
      openCloseWeeks: [],
      landingWeek: corrections.landingWeek ?? null,
    }, keptRepair);
  }

  if (!driverId) driverId = await findDriver(orgId);
  const alreadyPosted = driverId ? await payoutKeysPosted(orgId, driverId) : false;
  const step = resolvePastWeeksStep({
    legacyRemaining: 0,
    closeWeeksOpen: 0,
    correctionsPending: false,
    payoutsPosted: alreadyPosted,
  });
  return status({
    applicable: true,
    driverId,
    step,
    complete: step === "done",
    alreadyPosted,
    nextCloseWeek: null,
    openCloseWeeks: [],
    landingWeek: corrections.landingWeek ?? null,
  }, keptRepair);
}
