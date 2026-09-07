/**
 * Toll week seal (Close Program Pass 2).
 *
 * Publishes an immutable `toll` week_statement per active driver for an
 * org-week from the persisted driver_financial_periods columns, so Close Week's
 * cross-system invariants find an independent toll lane (fuel publishes at
 * finalize; earnings at period rebuild). The four-card toll identity
 * (Spend − Reimbursed − ChargedToDrivers − NetLoss = 0) is preserved by
 * deriving NetLoss from the period columns, so a sealed week never trips
 * TOLL_IDENTITY_UNBALANCED.
 */
import { getServiceClient } from "./service_client.ts";
import { publishWeekStatement, getLatestWeekStatement } from "./week_statements.ts";

function sb() {
  return getServiceClient();
}

const WEEK_KEY = (v: unknown): string => String(v ?? "").slice(0, 10);
const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const cents = (n: number): number => Math.round((Number(n) || 0) * 100);

export async function sealTollWeek(opts: {
  organizationId: string;
  weekKey: string; // Monday YMD
  actorId?: string;
  /** Optional: map driverId → charged-to-driver amount (major) to override period column. */
  chargedAmountsMajor?: Record<string, number>;
  /** Optional per-driver netting overrides (major units). */
  nettingByDriver?: Record<string, { reimbursed?: number; netLoss?: number }>;
  /** Re-seal drivers that already have a standing toll statement (default: skip unchanged). */
  force?: boolean;
}): Promise<{ published: number }> {
  const organizationId = String(opts.organizationId || "").trim();
  const weekKey = WEEK_KEY(opts.weekKey);
  if (!organizationId || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    throw new Error("sealTollWeek requires organizationId and weekKey (YYYY-MM-DD)");
  }

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, toll_spend, toll_charged_to_driver, toll_reimbursed, toll_cash_spend, toll_tag_spend",
    )
    .eq("organization_id", organizationId)
    .eq("period_anchor", weekKey);
  if (error) throw new Error(error.message);

  let published = 0;
  for (const p of periods ?? []) {
    const driverId = String(p.driver_id || "");
    if (!driverId) continue;

    const tollSpend = round2(Number(p.toll_spend) || 0);
    const override = opts.chargedAmountsMajor?.[driverId];
    const chargedToDriver = round2(
      override != null ? override : Number(p.toll_charged_to_driver) || 0,
    );
    const netting = opts.nettingByDriver?.[driverId];
    const reimbursed = round2(
      netting?.reimbursed != null ? netting.reimbursed : Number(p.toll_reimbursed) || 0,
    );
    const cashWashSpend = round2(Number(p.toll_cash_spend) || 0);
    const tagSpend = round2(Number(p.toll_tag_spend) || 0);
    // Fleet-absorbed loss balances the four-card identity unless overridden.
    const netLoss = round2(
      netting?.netLoss != null
        ? netting.netLoss
        : tollSpend - reimbursed - chargedToDriver,
    );

    // Only drivers with real toll activity get a lane (matches wizard financials).
    const hasActivity =
      tollSpend > 0.005 || Math.abs(chargedToDriver) > 0.005 || Math.abs(reimbursed) > 0.005;
    if (!hasActivity) continue;

    const amountsMinor = {
      totalSpend: cents(tollSpend),
      chargedToDriver: cents(chargedToDriver),
      reimbursed: cents(reimbursed),
      netLoss: cents(netLoss),
      cashWashSpend: cents(cashWashSpend),
      tagSpend: cents(tagSpend),
    };

    if (!opts.force) {
      const latest = await getLatestWeekStatement(organizationId, driverId, weekKey, "toll");
      const unchanged =
        latest &&
        latest.status === "closed" &&
        JSON.stringify(latest.amountsMinor) === JSON.stringify(amountsMinor);
      if (unchanged) continue;
    }

    await publishWeekStatement({
      kind: "toll",
      organizationId,
      driverId,
      weekKey,
      amountsMinor,
      status: "closed",
      closedBy: opts.actorId ?? "toll_week_seal",
      closeReason: "toll_week_seal",
    });
    published += 1;
  }

  return { published };
}
