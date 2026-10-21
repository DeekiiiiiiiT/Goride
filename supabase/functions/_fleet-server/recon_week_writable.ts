/**
 * Wizard writes stop once the week is closed.
 * A closed recon run or any frozen driver period for that Monday is enough.
 */
import { getServiceClient } from "./service_client.ts";
import { isPeriodFrozen } from "./settlement_period_freeze.ts";

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function isReconWeekFrozen(orgId: string, weekKey: string): Promise<boolean> {
  const week = String(weekKey || "").slice(0, 10);
  if (!WEEK_RE.test(week) || !orgId) return false;
  const sb = getServiceClient();

  const { data: runs } = await sb
    .schema("recon")
    .from("week_runs")
    .select("state")
    .eq("organization_id", orgId)
    .eq("week_key", week);
  if ((runs ?? []).some((r) => String((r as { state?: string }).state || "") === "closed")) {
    return true;
  }

  const { data: periods } = await sb
    .from("driver_financial_periods")
    .select("status, closed_at, metadata")
    .eq("organization_id", orgId)
    .eq("period_anchor", week)
    .limit(200);
  return (periods ?? []).some((p) => {
    const row = p as {
      status?: string | null;
      closed_at?: string | null;
      metadata?: Record<string, unknown> | null;
    };
    return isPeriodFrozen({
      status: row.status,
      closedAt: row.closed_at,
      metadata: row.metadata,
    });
  });
}
