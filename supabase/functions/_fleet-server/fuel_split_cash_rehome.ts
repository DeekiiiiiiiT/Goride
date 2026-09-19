/**
 * Split cash re-home — when Dominion lands after the fill week is locked,
 * post reimbursement into the driver's next open fuel period (C1).
 */
import { custodyTargetWeekCandidates } from "../../../packages/finance-core/src/custodyCarry.ts";
import {
  classifySplitCashPeriodLanding,
  type SplitCashPeriodLandingDecision,
} from "../../../packages/fuel-core/src/fuelSplitCashLifecycle.ts";
import { getServiceClient } from "./service_client.ts";
import { weekKeyForDateStr } from "./period_reset.ts";
import { getFleetTimezone } from "./timezone_helper.tsx";
import { getLatestWeekStatement } from "./week_statements.ts";

function ymd(v: unknown): string {
  return String(v || "").slice(0, 10);
}

function periodEndYmd(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  if (!y || !m || !d) return weekStart;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 6);
  return dt.toISOString().slice(0, 10);
}

async function isFuelWeekSealed(opts: {
  orgId: string;
  driverId: string;
  weekKey: string;
}): Promise<boolean> {
  const sb = getServiceClient();
  const periodId = `${opts.orgId}:${opts.weekKey}`;
  const { data: recon } = await sb
    .from("fuel_reconciliation_period")
    .select("status, locked_at")
    .eq("org_id", opts.orgId)
    .eq("id", periodId)
    .maybeSingle();
  if (recon && (String(recon.status) === "locked" || recon.locked_at)) {
    return true;
  }

  const { data: dfp } = await sb
    .from("driver_financial_periods")
    .select("status, fuel_finalized, closed_at")
    .eq("driver_id", opts.driverId)
    .eq("period_anchor", opts.weekKey)
    .maybeSingle();
  if (dfp) {
    const st = String(dfp.status || "").toLowerCase();
    if (st === "locked" || st === "closed" || dfp.fuel_finalized || dfp.closed_at) {
      return true;
    }
  }

  try {
    const stmt = await getLatestWeekStatement(opts.orgId, opts.driverId, opts.weekKey, "fuel");
    if (stmt && String(stmt.status || "").toLowerCase() === "closed") return true;
  } catch {
    /* non-fatal — fall through */
  }
  return false;
}

async function findOpenFuelWeekTarget(opts: {
  orgId: string;
  driverId: string;
  afterWeekKey: string;
}): Promise<string | null> {
  const candidates = custodyTargetWeekCandidates(opts.afterWeekKey, 12);
  for (const weekKey of candidates) {
    const sealed = await isFuelWeekSealed({
      orgId: opts.orgId,
      driverId: opts.driverId,
      weekKey,
    });
    if (!sealed) return weekKey;
  }
  return null;
}

export type SplitCashPeriodPlan = SplitCashPeriodLandingDecision;

/**
 * Decide where derived cash money may land. Physical fill facts stay on original date.
 * Missing org/driver/week fails closed — never bypass seal checks (audit §9.8.3).
 */
export async function planSplitCashPeriodLanding(opts: {
  orgId: string;
  driverId: string;
  fillDate: string;
}): Promise<SplitCashPeriodPlan> {
  const originalFillDate = ymd(opts.fillDate);
  const tz = await getFleetTimezone("fleet").catch(() => "America/Jamaica");
  const fillWeekKey = weekKeyForDateStr(originalFillDate || opts.fillDate, tz);

  // Fail closed before any seal I/O when identity is incomplete
  if (!opts.orgId || !opts.driverId || !fillWeekKey) {
    return classifySplitCashPeriodLanding({
      orgId: opts.orgId || "",
      driverId: opts.driverId || "",
      fillWeekKey: fillWeekKey || originalFillDate || "",
      originalFillDate: originalFillDate || fillWeekKey || "",
      fillWeekSealed: true,
      openTargetWeek: null,
    });
  }

  const sealed = await isFuelWeekSealed({
    orgId: opts.orgId,
    driverId: opts.driverId,
    weekKey: fillWeekKey,
  });

  const openTargetWeek = sealed
    ? await findOpenFuelWeekTarget({
        orgId: opts.orgId,
        driverId: opts.driverId,
        afterWeekKey: fillWeekKey,
      })
    : null;

  return classifySplitCashPeriodLanding({
    orgId: opts.orgId,
    driverId: opts.driverId,
    fillWeekKey,
    originalFillDate,
    fillWeekSealed: sealed,
    openTargetWeek,
  });
}

export { periodEndYmd, isFuelWeekSealed };
