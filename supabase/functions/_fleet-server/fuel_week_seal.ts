/**
 * Seal fuel week_statements for Close Week from the same snapshot engine Fuel
 * finalize / rebuild uses — NOT stale driver_financial_periods.fuel_deduction
 * (which can be $0 after wallet resets while the Consumption strip still shows
 * the live driver share).
 */
import { getServiceClient } from "./service_client.ts";
import { publishWeekStatement, getLatestWeekStatement } from "./week_statements.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import { buildFuelPeriodSnapshots } from "./fuel_period_build_snapshots.ts";
import * as kv from "./kv_store.tsx";

function sb() {
  return getServiceClient();
}

const WEEK_KEY = (v: unknown): string => String(v ?? "").slice(0, 10);
const cents = (n: number): number => Math.round((Number(n) || 0) * 100);
const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

function finalizedReportKey(weekKey: string, driverId: string): string {
  return `finalized_report:${weekKey}:${driverId}`;
}

type FuelAmounts = {
  driverShare: number;
  companyShare: number;
  totalSpend: number;
  miscellaneousCost: number;
  source: string;
};

async function amountsFromRebuild(
  organizationId: string,
  weekKey: string,
): Promise<Map<string, FuelAmounts>> {
  const weekEnd = periodEndForAnchor(weekKey);
  const built = await buildFuelPeriodSnapshots({
    orgId: organizationId,
    weekStart: weekKey,
    weekEnd,
  });
  const out = new Map<string, FuelAmounts>();
  if (!built.ok) return out;
  for (const snap of built.snapshots) {
    const driverId = String(snap.driverId || "").trim();
    if (!driverId) continue;
    out.set(driverId, {
      driverShare: round2(Number(snap.driverShare) || 0),
      companyShare: round2(Number(snap.companyShare) || 0),
      totalSpend: round2(
        Number(snap.totalGasCardCost) ||
          Number(snap.gasCardSpend) ||
          Number(snap.driverSpend) ||
          0,
      ),
      miscellaneousCost: round2(Number(snap.miscellaneousCost) || 0),
      source: "fuel_week_rebuild",
    });
  }
  return out;
}

async function amountsFromFinalizedKv(
  organizationId: string,
  weekKey: string,
  driverId: string,
): Promise<FuelAmounts | null> {
  const snap = await kv.get(finalizedReportKey(weekKey, driverId));
  if (!snap) return null;
  const snapOrg = String(snap.orgId || snap.org_id || "");
  if (snapOrg && snapOrg !== organizationId) return null;
  return {
    driverShare: round2(Number(snap.driverShare) || 0),
    companyShare: round2(Number(snap.companyShare) || 0),
    totalSpend: round2(
      Number(snap.totalGasCardCost) ||
        Number(snap.gasCardSpend) ||
        Number(snap.driverSpend) ||
        0,
    ),
    miscellaneousCost: round2(Number(snap.miscellaneousCost) || 0),
    source: "finalized_report",
  };
}

export async function sealFuelWeek(opts: {
  organizationId: string;
  weekKey: string;
  actorId?: string;
  force?: boolean;
  /** Optional per-driver overrides (major units) — e.g. Consumption money strip. */
  amountsByDriver?: Record<
    string,
    {
      driverShare?: number;
      companyShare?: number;
      totalSpend?: number;
      miscellaneousCost?: number;
    }
  >;
}): Promise<{ published: number }> {
  const organizationId = String(opts.organizationId || "").trim();
  const weekKey = WEEK_KEY(opts.weekKey);
  if (!organizationId || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    throw new Error("sealFuelWeek requires organizationId and weekKey (YYYY-MM-DD)");
  }

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("driver_id, fuel_deduction, fuel_fleet_share, fuel_finalized")
    .eq("organization_id", organizationId)
    .eq("period_anchor", weekKey);
  if (error) throw new Error(error.message);

  let rebuilt = new Map<string, FuelAmounts>();
  try {
    rebuilt = await amountsFromRebuild(organizationId, weekKey);
  } catch (e) {
    console.warn("[sealFuelWeek] rebuild failed — falling back to KV/period", e);
  }

  let published = 0;
  for (const p of periods ?? []) {
    const driverId = String(p.driver_id || "");
    if (!driverId) continue;

    let amounts =
      rebuilt.get(driverId) ||
      (await amountsFromFinalizedKv(organizationId, weekKey, driverId));

    if (!amounts) {
      amounts = {
        driverShare: round2(Number(p.fuel_deduction) || 0),
        companyShare: round2(Number(p.fuel_fleet_share) || 0),
        totalSpend: 0,
        miscellaneousCost: 0,
        source: p.fuel_finalized ? "period_fuel_finalized" : "period_columns",
      };
    }

    // Prefer rebuild/KV when they carry a non-zero driver share but DFP is $0
    // (wallet reset / bad finalize left the projection empty while Consumption
    // still shows the live split).
    if (
      amounts.source !== "fuel_week_rebuild" &&
      Math.abs(amounts.driverShare) < 0.005 &&
      rebuilt.has(driverId) &&
      Math.abs(rebuilt.get(driverId)!.driverShare) > 0.005
    ) {
      amounts = rebuilt.get(driverId)!;
    }

    const override = opts.amountsByDriver?.[driverId];
    if (override) {
      amounts = {
        driverShare: round2(override.driverShare ?? amounts.driverShare),
        companyShare: round2(override.companyShare ?? amounts.companyShare),
        totalSpend: round2(override.totalSpend ?? amounts.totalSpend),
        miscellaneousCost: round2(override.miscellaneousCost ?? amounts.miscellaneousCost),
        source: "consumption_strip",
      };
    }

    const hasActivity =
      Math.abs(amounts.driverShare) > 0.005 ||
      Math.abs(amounts.companyShare) > 0.005 ||
      Math.abs(amounts.totalSpend) > 0.005;
    if (!hasActivity && !p.fuel_finalized) continue;

    // Pass 3 / H-7: only rebuild snapshot, finalized_report KV, or consumption
    // strip overrides may close fuel. Period-column copies stay draft.
    const verifiedSources = new Set([
      "fuel_week_rebuild",
      "finalized_report",
      "consumption_strip",
    ]);
    const independent = verifiedSources.has(amounts.source);
    const status: "draft" | "closed" = independent ? "closed" : "draft";

    const amountsMinor = {
      driverShare: cents(amounts.driverShare),
      companyShare: cents(amounts.companyShare),
      totalSpend: cents(amounts.totalSpend),
      miscellaneousCost: cents(amounts.miscellaneousCost),
    };

    if (!opts.force) {
      const latest = await getLatestWeekStatement(organizationId, driverId, weekKey, "fuel");
      const unchanged =
        latest &&
        latest.status === status &&
        JSON.stringify(latest.amountsMinor) === JSON.stringify(amountsMinor);
      if (unchanged) continue;
    }

    await publishWeekStatement({
      kind: "fuel",
      organizationId,
      driverId,
      weekKey,
      amountsMinor,
      status,
      closedBy: status === "closed" ? (opts.actorId ?? "fuel_week_seal") : null,
      closeReason:
        status === "closed"
          ? `fuel_week_seal:${amounts.source}`
          : "close_precondition_unverified",
    });
    published += 1;
  }

  return { published };
}
