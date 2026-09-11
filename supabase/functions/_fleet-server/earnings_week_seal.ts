/**
 * Pass 5.2: independent earnings week seal (H-7).
 * Publishes earnings statements from commission + cash engines — not DFP columns.
 */
import { getServiceClient } from "./service_client.ts";
import { publishWeekStatement, getLatestWeekStatement, RestatementDraftBlockedError } from "./week_statements.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import {
  computeWeekCommissionShare,
  computeWeekCashBase,
} from "./period_share_cash.ts";
import type { EarningsEngineAmounts } from "../../../packages/finance-core/src/statementEngineCompare.ts";
import {
  loadRebuildContext,
  type RebuildContext,
} from "./driver_financial_periods.ts";
import { resolveActiveEarningsBundleForDriverWeek } from "./earnings_policy_runtime.ts";

function sb() {
  return getServiceClient();
}

const WEEK_KEY = (v: unknown): string => String(v ?? "").slice(0, 10);
const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const cents = (n: number): number => Math.round((Number(n) || 0) * 100);

function faresInWeek(entries: any[], periodAnchor: string, periodEnd: string, timezone: string) {
  // period_share_cash filters by period; pass full arrays and let the engine bucket.
  void timezone;
  void periodAnchor;
  void periodEnd;
  return entries || [];
}

/** Fresh commission + cash amounts for one driver-week (no persist). */
export async function computeEarningsEngineAmountsForWeek(
  driverId: string,
  weekKey: string,
  ctx?: RebuildContext,
): Promise<EarningsEngineAmounts | null> {
  const periodAnchor = WEEK_KEY(weekKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodAnchor)) return null;
  const periodEnd = periodEndForAnchor(periodAnchor);
  try {
    const context = ctx || (await loadRebuildContext(driverId));
    const timezone = context.timezone || "America/Jamaica";
    const bundleEH = resolveActiveEarningsBundleForDriverWeek({
      policies: context.earningsPolicies || [],
      driverId,
      weekStartYmd: periodAnchor,
      legacy: context.legacyEarnings,
      serviceLine: context.filterServiceLine || "rideshare",
    });
    const share = computeWeekCommissionShare({
      fareEntries: faresInWeek(context.fareEntries || [], periodAnchor, periodEnd, timezone),
      tipEntries: context.tipEntries || [],
      periodAnchor,
      periodEnd,
      tiers: bundleEH.tiers || context.legacyEarnings.tiers,
      quotaConfig: bundleEH.quotas || context.legacyEarnings.quotas,
      timezone,
    });
    const cashBase = computeWeekCashBase({
      periodAnchor,
      periodEnd,
      trips: context.scopedTrips || [],
      transactions: context.driverTxAll || [],
      uberPayoutCash: context.payoutCashByAnchor?.get(periodAnchor) || 0,
      timezone,
    });
    return {
      driverShare: round2(share.driverShare),
      companyShare: round2(share.fleetShare),
      tipsPaidToDriver: round2(Number(share.tipsPaidToDriver) || 0),
      passengerCash: round2(Math.max(0, cashBase.passengerCash)),
      gross: round2(share.earningsGross),
    };
  } catch (e) {
    console.warn("[sealEarningsWeek] engine compute failed", driverId, periodAnchor, e);
    return null;
  }
}

export async function sealEarningsWeek(opts: {
  organizationId: string;
  weekKey: string;
  actorId?: string;
  force?: boolean;
  /** H-6: shared prepare as_of — stamped on close_reason / source rows for audit. */
  asOf?: string;
}): Promise<{ published: number }> {
  const organizationId = String(opts.organizationId || "").trim();
  const weekKey = WEEK_KEY(opts.weekKey);
  if (!organizationId || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    throw new Error("sealEarningsWeek requires organizationId and weekKey (YYYY-MM-DD)");
  }

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("driver_id, earnings_gross, driver_share, fleet_share, cash_collected, tips_paid_to_driver")
    .eq("organization_id", organizationId)
    .eq("period_anchor", weekKey);
  if (error) throw new Error(error.message);

  let published = 0;
  for (const p of periods ?? []) {
    const driverId = String(p.driver_id || "");
    if (!driverId) continue;

    const engine = await computeEarningsEngineAmountsForWeek(driverId, weekKey);
    let status: "draft" | "closed" = "draft";
    let closeReason = "close_precondition_unverified";
    let amounts: EarningsEngineAmounts;
    let sourceRowIds: string[] = [];

    if (engine) {
      amounts = engine;
      const hasActivity =
        Math.abs(engine.gross) > 0.005 ||
        Math.abs(engine.passengerCash) > 0.005 ||
        Math.abs(engine.driverShare) > 0.005;
      status = "closed";
      closeReason = hasActivity ? "earnings_week_seal_engines" : "zero_activity_na";
      sourceRowIds = [`earnings_seal:${driverId}:${weekKey}`];
      if (opts.asOf) sourceRowIds.push(`as_of:${opts.asOf}`);
    } else {
      // Cannot run engines — draft from period so close blocks as unverified.
      amounts = {
        driverShare: round2(Number(p.driver_share) || 0),
        companyShare: round2(Number(p.fleet_share) || 0),
        tipsPaidToDriver: round2(Number(p.tips_paid_to_driver) || 0),
        passengerCash: round2(Number(p.cash_collected) || 0),
        gross: round2(Number(p.earnings_gross) || 0),
      };
      status = "draft";
      closeReason = "close_precondition_unverified";
    }

    const amountsMinor = {
      driverShare: cents(amounts.driverShare),
      companyShare: cents(amounts.companyShare),
      tipsPaidToDriver: cents(amounts.tipsPaidToDriver),
      passengerCash: cents(amounts.passengerCash),
      gross: cents(amounts.gross),
    };

    const latest = await getLatestWeekStatement(organizationId, driverId, weekKey, "earnings");
    if (!opts.force) {
      const unchanged =
        latest &&
        latest.status === status &&
        JSON.stringify(latest.amountsMinor) === JSON.stringify(amountsMinor);
      if (unchanged) continue;
    }

    // Never invent draft-over-closed restatement spam from Close sync / seal.
    if (status === "draft") {
      if (latest?.status === "closed") {
        console.warn(
          "[sealEarningsWeek] keeping standing closed — engines unverified",
          driverId,
          weekKey,
        );
        continue;
      }
      if (latest?.supersedes) {
        console.warn(
          "[sealEarningsWeek] skip additional restatement draft",
          driverId,
          weekKey,
        );
        continue;
      }
    }

    try {
      const asOfTag = opts.asOf ? `;as_of=${opts.asOf}` : "";
      await publishWeekStatement({
        kind: "earnings",
        organizationId,
        driverId,
        weekKey,
        amountsMinor,
        sourceRowIds,
        status,
        closedBy: status === "closed" ? (opts.actorId ?? "earnings_week_seal") : null,
        closeReason: status === "closed" ? `${closeReason}${asOfTag}` : closeReason,
      });
      published += 1;
    } catch (e) {
      if (e instanceof RestatementDraftBlockedError) {
        console.warn("[sealEarningsWeek]", e.message);
        continue;
      }
      throw e;
    }
  }

  return { published };
}
