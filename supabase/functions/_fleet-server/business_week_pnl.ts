/**
 * Pass 5.4: Business Finance week P&L feed for Close Week settlement↔P&L tie.
 *
 * Uses closed week_statements for the org-week (same sealed facts Close trusts):
 *   fleet P&L ≈ Σ earnings.companyShare + Σ fuel.companyShare + Σ toll.netLoss
 * When any lane is missing closed statements for a driver with a period row,
 * returns null so closeInvariants can warn (honest degrade).
 */
import { getServiceClient } from "./service_client.ts";
import { getLatestWeekStatements } from "./week_statements.ts";
import { statementAmountMajor } from "../../../packages/finance-core/src/weekStatement.ts";

function sb() {
  return getServiceClient();
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export async function sumBusinessWeekPnlMajor(
  organizationId: string,
  weekKey: string,
): Promise<number | null> {
  const orgId = String(organizationId || "").trim();
  const week = String(weekKey || "").slice(0, 10);
  if (!orgId || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return null;

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("driver_id")
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) {
    console.warn("[business_week_pnl] period load failed", error.message);
    return null;
  }

  let total = 0;
  let anyClosed = false;
  for (const p of periods ?? []) {
    const driverId = String(p.driver_id || "");
    if (!driverId) continue;
    const statements = await getLatestWeekStatements(orgId, driverId, week);
    const closed = statements.filter((s) => s.status === "closed");
    if (closed.length === 0) continue;
    anyClosed = true;
    for (const s of closed) {
      if (s.kind === "earnings") {
        total = round2(total + statementAmountMajor(s, "companyShare"));
      } else if (s.kind === "fuel") {
        total = round2(total + statementAmountMajor(s, "companyShare"));
      } else if (s.kind === "toll") {
        const netLoss = statementAmountMajor(s, "netLoss");
        if (Number.isFinite(netLoss)) {
          total = round2(total + netLoss);
        } else {
          const spend = statementAmountMajor(s, "totalSpend");
          const reimb = statementAmountMajor(s, "reimbursed");
          const charged = statementAmountMajor(s, "chargedToDriver");
          total = round2(total + (spend - reimb - charged));
        }
      }
    }
  }

  if (!anyClosed) return null;
  return total;
}
