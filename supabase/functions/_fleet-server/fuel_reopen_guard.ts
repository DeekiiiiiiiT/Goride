/**
 * Fuel audit F-32a — one guard for every way a fuel week is unlocked
 * (the Reset period route and the reversal Reopen job):
 *   - a reason of at least FUEL_REOPEN_REASON_MIN characters, checked on the server;
 *   - a week whose settlement is closed is refused.
 *
 * "Settlement closed" uses the same records the fuel rules screen already treats as
 * closed (register_fuel_scenario_routes.ts frozenMondays), plus the Week Reconciliation
 * run:
 *   - public.finance_period_locks row for the org + week;
 *   - any ledger driver_financial_periods row for the week with status closed or closed_at;
 *   - recon.week_runs for the week in state closed.
 */
import { getServiceClient, getServiceClientWithSchema } from "./service_client.ts";

export const FUEL_REOPEN_REASON_MIN = 10;

export type FuelReopenReasonCheck =
  | { ok: true; reason: string }
  | { ok: false; error: "reason_too_short"; minLength: number; message: string };

/** Pure: trims the reason and checks its length. */
export function checkFuelReopenReason(raw: unknown): FuelReopenReasonCheck {
  const reason = String(raw ?? "").trim();
  if (reason.length < FUEL_REOPEN_REASON_MIN) {
    return {
      ok: false,
      error: "reason_too_short",
      minLength: FUEL_REOPEN_REASON_MIN,
      message: `Give a reason of at least ${FUEL_REOPEN_REASON_MIN} characters.`,
    };
  }
  return { ok: true, reason };
}

export type FuelWeekSettledResult = { settled: false } | { settled: true; by: string };

function missingTable(msg: string): boolean {
  return /does not exist|schema cache|Could not find/i.test(msg);
}

export type SettledLookups = {
  financeLock(orgId: string, week: string): Promise<boolean>;
  driverPeriodClosed(orgId: string, week: string): Promise<boolean>;
  reconRunClosed(orgId: string, week: string, serviceLine: string | null): Promise<boolean>;
};

const liveLookups: SettledLookups = {
  async financeLock(orgId, week) {
    const { data, error } = await getServiceClient()
      .from("finance_period_locks")
      .select("week_start")
      .eq("organization_id", orgId)
      .eq("week_start", week)
      .limit(1);
    if (error) {
      if (missingTable(String(error.message || ""))) return false;
      throw new Error(`finance_period_locks read failed: ${error.message}`);
    }
    return (data || []).length > 0;
  },
  async driverPeriodClosed(orgId, week) {
    const { data, error } = await getServiceClient()
      .from("driver_financial_periods")
      .select("status, closed_at")
      .eq("organization_id", orgId)
      .eq("period_anchor", week);
    if (error) {
      if (missingTable(String(error.message || ""))) return false;
      throw new Error(`driver_financial_periods read failed: ${error.message}`);
    }
    return (data || []).some(
      (r: { status?: unknown; closed_at?: unknown }) =>
        String(r.status || "").toLowerCase() === "closed" || r.closed_at != null,
    );
  },
  async reconRunClosed(orgId, week, serviceLine) {
    let q = getServiceClientWithSchema("recon")
      .from("week_runs")
      .select("state")
      .eq("organization_id", orgId)
      .eq("week_key", week)
      .eq("state", "closed");
    if (serviceLine) q = q.eq("service_line", serviceLine);
    const { data, error } = await q.limit(1);
    if (error) {
      if (missingTable(String(error.message || ""))) return false;
      throw new Error(`recon.week_runs read failed: ${error.message}`);
    }
    return (data || []).length > 0;
  },
};

/**
 * Is this fuel week's settlement closed? serviceLine narrows the recon run check;
 * null checks every line (the Reset period route works on the whole week).
 * A read failure throws: the caller refuses rather than unlocking blind.
 */
export async function fuelWeekSettled(
  orgId: string,
  weekStart: string,
  serviceLine: string | null,
  lookups: SettledLookups = liveLookups,
): Promise<FuelWeekSettledResult> {
  const week = String(weekStart || "").slice(0, 10);
  if (await lookups.financeLock(orgId, week)) return { settled: true, by: "finance_period_lock" };
  if (await lookups.driverPeriodClosed(orgId, week)) return { settled: true, by: "driver_settlement_closed" };
  if (await lookups.reconRunClosed(orgId, week, serviceLine)) return { settled: true, by: "week_reconciliation_closed" };
  return { settled: false };
}

export const FUEL_WEEK_SETTLED_MESSAGE =
  "This week's settlement is closed, so its fuel can't be reset or reopened.";
