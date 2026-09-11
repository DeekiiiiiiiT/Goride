/**
 * Seal fuel week_statements for Close Week from the same snapshot engine Fuel
 * finalize / rebuild uses — NOT stale driver_financial_periods.fuel_deduction
 * (which can be $0 after wallet resets while the Consumption strip still shows
 * the live driver share).
 *
 * resolveFuelCloseAmounts is the single preference order for seal + Close Week
 * engine probe (toll-style: probe and seal cannot diverge).
 */
import { getServiceClient } from "./service_client.ts";
import { publishWeekStatement, getLatestWeekStatement, RestatementDraftBlockedError } from "./week_statements.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import { buildFuelPeriodSnapshots } from "./fuel_period_build_snapshots.ts";
import * as kv from "./kv_store.tsx";
import {
  pickFuelCloseAmounts,
  type FuelCloseAmountOverride,
  type FuelCloseAmounts,
} from "./fuel_close_amounts.ts";

export type { FuelCloseAmountOverride, FuelCloseAmounts } from "./fuel_close_amounts.ts";
export {
  buildFuelSealAmountsByDriver,
  isSuspiciousFuelRebuild,
  pickFuelCloseAmounts,
} from "./fuel_close_amounts.ts";

function sb() {
  return getServiceClient();
}

const WEEK_KEY = (v: unknown): string => String(v ?? "").slice(0, 10);
const cents = (n: number): number => Math.round((Number(n) || 0) * 100);
const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

function finalizedReportKey(weekKey: string, driverId: string): string {
  return `finalized_report:${weekKey}:${driverId}`;
}

async function amountsFromRebuild(
  organizationId: string,
  weekKey: string,
): Promise<Map<string, FuelCloseAmounts>> {
  const weekEnd = periodEndForAnchor(weekKey);
  const built = await buildFuelPeriodSnapshots({
    orgId: organizationId,
    weekStart: weekKey,
    weekEnd,
  });
  const out = new Map<string, FuelCloseAmounts>();
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
): Promise<FuelCloseAmounts | null> {
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

/** Last Consumption-strip seal for this driver-week (standing or restated history). */
async function amountsFromConsumptionHistory(
  organizationId: string,
  driverId: string,
  weekKey: string,
): Promise<FuelCloseAmounts | null> {
  const { data, error } = await sb()
    .from("week_statements")
    .select("amounts_minor, close_reason")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("week_key", weekKey)
    .eq("kind", "fuel")
    .like("close_reason", "%consumption_strip%")
    .order("version", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const minor = (data[0].amounts_minor || {}) as Record<string, number>;
  const driverShare = round2((Number(minor.driverShare) || 0) / 100);
  const companyShare = round2((Number(minor.companyShare) || 0) / 100);
  if (Math.abs(driverShare) < 0.005 && Math.abs(companyShare) < 0.005) return null;
  return {
    driverShare,
    companyShare,
    totalSpend: round2((Number(minor.totalSpend) || 0) / 100),
    miscellaneousCost: round2((Number(minor.miscellaneousCost) || 0) / 100),
    source: "consumption_strip",
  };
}

/**
 * Resolve Close Week fuel amounts for one driver (seal + probe share this).
 * Pass `fromRebuild` when the caller already built the week map (seal batch).
 */
export async function resolveFuelCloseAmounts(opts: {
  organizationId: string;
  weekKey: string;
  driverId: string;
  override?: FuelCloseAmountOverride | null;
  period?: {
    fuel_deduction?: number | null;
    fuel_fleet_share?: number | null;
    fuel_finalized?: boolean | null;
  } | null;
  fromRebuild?: FuelCloseAmounts | null;
}): Promise<FuelCloseAmounts> {
  const organizationId = String(opts.organizationId || "").trim();
  const weekKey = WEEK_KEY(opts.weekKey);
  const driverId = String(opts.driverId || "").trim();

  const fromKv = await amountsFromFinalizedKv(organizationId, weekKey, driverId);
  const fromConsumption = await amountsFromConsumptionHistory(organizationId, driverId, weekKey);

  // Seal passes fromRebuild (batch); probe omits it and loads once per call.
  let fromRebuild: FuelCloseAmounts | null =
    opts.fromRebuild !== undefined ? opts.fromRebuild : null;
  if (opts.fromRebuild === undefined) {
    try {
      const map = await amountsFromRebuild(organizationId, weekKey);
      fromRebuild = map.get(driverId) || null;
    } catch {
      fromRebuild = null;
    }
  }

  const fuelFinalized = Boolean(opts.period?.fuel_finalized);
  const periodFallback: FuelCloseAmounts = {
    driverShare: round2(Number(opts.period?.fuel_deduction) || 0),
    companyShare: round2(Number(opts.period?.fuel_fleet_share) || 0),
    totalSpend: 0,
    miscellaneousCost: 0,
    source: fuelFinalized ? "period_fuel_finalized" : "period_columns",
  };

  return pickFuelCloseAmounts({
    override: opts.override,
    fromConsumption,
    fromKv,
    fromRebuild,
    periodFallback,
  });
}

export async function sealFuelWeek(opts: {
  organizationId: string;
  weekKey: string;
  actorId?: string;
  force?: boolean;
  /** H-6: shared prepare as_of — stamped on close_reason / source rows for audit. */
  asOf?: string;
  /** Optional per-driver overrides (major units) — e.g. Finalize snapshots / Consumption strip. */
  amountsByDriver?: Record<string, FuelCloseAmountOverride>;
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

  let rebuilt = new Map<string, FuelCloseAmounts>();
  try {
    rebuilt = await amountsFromRebuild(organizationId, weekKey);
  } catch (e) {
    console.warn("[sealFuelWeek] rebuild failed — falling back to KV/period", e);
  }

  let published = 0;
  for (const p of periods ?? []) {
    const driverId = String(p.driver_id || "");
    if (!driverId) continue;

    const amounts = await resolveFuelCloseAmounts({
      organizationId,
      weekKey,
      driverId,
      override: opts.amountsByDriver?.[driverId] ?? null,
      period: p,
      fromRebuild: rebuilt.get(driverId) || null,
    });

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

    if (status === "draft") {
      const latest = await getLatestWeekStatement(organizationId, driverId, weekKey, "fuel");
      if (latest?.status === "closed" || latest?.supersedes) {
        console.warn(
          "[sealFuelWeek] keeping standing closed / skip restatement draft",
          driverId,
          weekKey,
        );
        continue;
      }
    }

    try {
      const asOfTag = opts.asOf ? `;as_of=${opts.asOf}` : "";
      await publishWeekStatement({
        kind: "fuel",
        organizationId,
        driverId,
        weekKey,
        amountsMinor,
        sourceRowIds: opts.asOf ? [`as_of:${opts.asOf}`] : undefined,
        status,
        closedBy: status === "closed" ? (opts.actorId ?? "fuel_week_seal") : null,
        closeReason:
          status === "closed"
            ? `fuel_week_seal:${amounts.source}${asOfTag}`
            : "close_precondition_unverified",
      });
      published += 1;
    } catch (e) {
      if (e instanceof RestatementDraftBlockedError) {
        console.warn("[sealFuelWeek]", e.message);
        continue;
      }
      throw e;
    }
  }

  return { published };
}
