/** Server-side categoryCosts from snapshot settledEntries + optional trip aggregates. */
import type { WeekSnapCategoryCosts } from "../../../packages/fuel-core/src/weekSnapshotEngine.ts";

export type FuelCategoryLoaderEntry = {
  amount: number;
  usageCategory?: string | null;
  driverId?: string | null;
  vehicleId?: string | null;
  /** N-3: needed for window timing / unattributed derive. */
  liters?: number | null;
  odometer?: number | null;
  type?: string | null;
  paymentSource?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type FuelCategoryLoaderTripAgg = Partial<WeekSnapCategoryCosts>;

const EMPTY: WeekSnapCategoryCosts = {
  rideShareCost: 0,
  companyUsageCost: 0,
  deadheadCost: 0,
  personalUsageCost: 0,
};

function bucketForUsage(raw: string | null | undefined): keyof WeekSnapCategoryCosts {
  const u = String(raw || "").toLowerCase();
  if (u.includes("company")) return "companyUsageCost";
  if (u.includes("deadhead")) return "deadheadCost";
  if (u.includes("personal")) return "personalUsageCost";
  return "rideShareCost";
}

/** Map entry spend (+ optional trip brain totals) into categoryCosts for computeFuelWeek. */
export function categoryCostsFromEntriesAndTrips(
  entries: FuelCategoryLoaderEntry[],
  tripAgg?: FuelCategoryLoaderTripAgg | null,
): WeekSnapCategoryCosts {
  if (tripAgg && typeof tripAgg === "object") {
    return {
      rideShareCost: Number(tripAgg.rideShareCost) || 0,
      companyUsageCost: Number(tripAgg.companyUsageCost) || 0,
      deadheadCost: Number(tripAgg.deadheadCost) || 0,
      personalUsageCost: Number(tripAgg.personalUsageCost) || 0,
    };
  }
  const out = { ...EMPTY };
  for (const e of entries) {
    const amt = Number(e.amount) || 0;
    if (amt <= 0) continue;
    const key = bucketForUsage(e.usageCategory);
    out[key] += amt;
  }
  return out;
}

const CAT_EPS = 0.009;

function snapRecord(snap: Record<string, unknown>): Record<string, unknown> {
  return (snap.metadata && typeof snap.metadata === "object"
    ? snap.metadata
    : {}) as Record<string, unknown>;
}

export function snapCategoryCostsRaw(
  snap: Record<string, unknown>,
): WeekSnapCategoryCosts | null {
  const meta = snapRecord(snap);
  const cats = (snap.categoryCosts || meta.categoryCosts) as WeekSnapCategoryCosts | null;
  if (!cats || typeof cats !== "object") return null;
  return {
    rideShareCost: Number(cats.rideShareCost) || 0,
    companyUsageCost: Number(cats.companyUsageCost) || 0,
    deadheadCost: Number(cats.deadheadCost) || 0,
    personalUsageCost: Number(cats.personalUsageCost) || 0,
  };
}

function settledEntriesFromSnap(snap: Record<string, unknown>): FuelCategoryLoaderEntry[] {
  const meta = snapRecord(snap);
  const raw = meta.settledEntries;
  if (!Array.isArray(raw)) return [];
  const out: FuelCategoryLoaderEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const e = row as Record<string, unknown>;
    out.push({
      amount: Number(e.amount) || 0,
      usageCategory: (e.usageCategory ?? e.usage_category ?? null) as string | null,
    });
  }
  return out;
}

function tripAggFromSnap(snap: Record<string, unknown>): FuelCategoryLoaderTripAgg | null {
  const meta = snapRecord(snap);
  const agg = meta.tripCategoryAgg ?? meta.tripCategoryTotals ?? meta.categoryCostsFromTrips;
  if (!agg || typeof agg !== "object") return null;
  return agg as FuelCategoryLoaderTripAgg;
}

function hasTaggedUsage(entries: FuelCategoryLoaderEntry[]): boolean {
  return entries.some((e) => String(e.usageCategory || "").trim().length > 0);
}

/** Shadow/enforce: tripAgg or tagged entries beat top-level categoryCosts; untagged entries alone never dump to rideShare. */
export function resolveEngineCategoryCosts(
  snap: Record<string, unknown>,
  /** Phase 4: server-loaded week entries with usage tags override client stamp. */
  serverTaggedEntries?: FuelCategoryLoaderEntry[] | null,
): {
  authority: WeekSnapCategoryCosts;
  snapCats: WeekSnapCategoryCosts | null;
  fromLoader: boolean;
  authoritySource: "server_entries" | "trip_agg" | "tagged_snap_entries" | "snap_category_costs";
} {
  const snapCats = snapCategoryCostsRaw(snap);
  const entries = settledEntriesFromSnap(snap);
  const tripAgg = tripAggFromSnap(snap);
  const snapDriver = String(snap.driverId || "").trim();
  const snapVehicle = String(snap.vehicleId || "").trim();
  const serverTagged = (serverTaggedEntries || []).filter((e) => {
    if (!String(e.usageCategory || "").trim()) return false;
    const did = String(e.driverId || "").trim();
    const vid = String(e.vehicleId || "").trim();
    if (snapDriver && did && did === snapDriver) return true;
    if (snapVehicle && vid && vid === snapVehicle) return true;
    return false;
  });
  // Tagged row amounts are purchase spend, not distance cost. Summing them
  // double-counts a gas-card fill that exists as both a manual row and a card
  // row, and it refuses a correct week. Spend is checked separately.
  void serverTagged;

  // N-15: untagged settledEntries are wallet evidence only — not category authority.
  const hasTaggedSnap = hasTaggedUsage(entries);
  if (tripAgg != null) {
    return {
      authority: categoryCostsFromEntriesAndTrips(
        hasTaggedSnap ? entries.filter((e) => String(e.usageCategory || "").trim().length > 0) : [],
        tripAgg,
      ),
      snapCats,
      fromLoader: true,
      authoritySource: "trip_agg",
    };
  }
  if (hasTaggedSnap) {
    const tagged = entries.filter((e) => String(e.usageCategory || "").trim().length > 0);
    return {
      authority: categoryCostsFromEntriesAndTrips(tagged, null),
      snapCats,
      fromLoader: true,
      authoritySource: "tagged_snap_entries",
    };
  }
  const fallback = snapCats ?? { ...EMPTY };
  return {
    authority: fallback,
    snapCats,
    fromLoader: false,
    authoritySource: "snap_category_costs",
  };
}

/**
 * N-3: all org-week fuel entries with litres/odometer for independent window-money derive.
 * Unlike tagged category load, usageCategory is optional — timing needs every ops fill.
 */
export async function loadServerWindowMoneyEntriesForWeek(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<FuelCategoryLoaderEntry[]> {
  try {
    const { fromKvStore } = await import("./fleet_sql_bridge.ts");
    const orgOr =
      `value->>organizationId.eq.${orgId},value->>orgId.eq.${orgId},value->>org_id.eq.${orgId}`;
    const { data, error } = await fromKvStore()
      .select("value")
      .like("key", "fuel_entry:%")
      .or(orgOr)
      .gte("value->>date", weekStart)
      .lte("value->>date", weekEnd);
    if (error) return [];
    const out: FuelCategoryLoaderEntry[] = [];
    for (const row of data || []) {
      const v = (row as { value?: Record<string, unknown> })?.value;
      if (!v || typeof v !== "object") continue;
      out.push({
        amount: Number(v.amount) || 0,
        usageCategory: (v.usageCategory ?? v.usage_category ?? null) as string | null,
        driverId: (v.driverId ?? v.driver_id ?? null) as string | null,
        vehicleId: (v.vehicleId ?? v.vehicle_id ?? null) as string | null,
        liters: v.liters != null ? Number(v.liters) : null,
        odometer: v.odometer != null ? Number(v.odometer) : null,
        type: (v.type as string) || null,
        paymentSource: (v.paymentSource ?? v.payment_source ?? null) as string | null,
        metadata: (v.metadata && typeof v.metadata === "object"
          ? (v.metadata as Record<string, unknown>)
          : null),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function materialCategoryCostDeltas(
  snapCats: WeekSnapCategoryCosts | null,
  loaderCats: WeekSnapCategoryCosts,
): Array<{ field: string; delta: number }> {
  if (!snapCats) return [];
  const keys: (keyof WeekSnapCategoryCosts)[] = [
    "rideShareCost",
    "companyUsageCost",
    "deadheadCost",
    "personalUsageCost",
  ];
  const out: Array<{ field: string; delta: number }> = [];
  for (const k of keys) {
    const a = Number(snapCats[k]) || 0;
    const b = Number(loaderCats[k]) || 0;
    if (Math.abs(a - b) > CAT_EPS) {
      out.push({ field: `category.${k}`, delta: a - b });
    }
  }
  return out;
}

/** Spend and payment split only. Distance categories are not raw fill sums. */
export function diffFuelSpendAgainstFills(args: {
  clientSpend: number;
  clientGasCard?: number;
  clientCash?: number;
  clientRideShare?: number;
  serverSpend: number;
  serverGasCard: number;
  serverCash: number;
  /** Independent engine rideshare, when a saved week snapshot has one. */
  serverRideShare?: number | null;
}): Array<{ field: string; delta: number }> {
  const out: Array<{ field: string; delta: number }> = [];
  const push = (field: string, client: number, server: number) => {
    const delta = Math.round((client - server) * 100) / 100;
    if (Math.abs(delta) > 0.05) out.push({ field, delta });
  };
  push("totalSpend", args.clientSpend, args.serverSpend);
  if (args.clientGasCard != null) push("gasCard", args.clientGasCard, args.serverGasCard);
  if (args.clientCash != null) push("cash", args.clientCash, args.serverCash);
  if (args.serverRideShare != null && args.clientRideShare != null) {
    push("rideShareCost", args.clientRideShare, args.serverRideShare);
  }
  return out;
}

export async function runFuelSpendShadow(args: {
  orgId: string;
  periodId?: string;
  snapshotVersion?: number;
  period: { week_start?: unknown; week_end?: unknown };
  snapshots: unknown[];
  forceClientMoney?: boolean;
  forceReason?: string;
}): Promise<{ blocked: boolean; mismatches: Array<Record<string, unknown>> }> {
  const engineMode = String(Deno.env.get("FUEL_SERVER_ENGINE") || "off").toLowerCase();
  if (engineMode !== "shadow" && engineMode !== "enforce") {
    return { blocked: false, mismatches: [] };
  }
  const { loadWeekFuelEntries } = await import("./fuel_period_build_snapshots.ts");
  const { selectWeekFuelFills, sumWeekFuelFills } = await import(
    "../../../packages/fuel-core/src/selectWeekFuelFills.ts"
  );
  const weekStart = String(args.period.week_start || "").split("T")[0];
  const weekEnd = String(args.period.week_end || weekStart).split("T")[0];
  const entries = await loadWeekFuelEntries(args.orgId, weekStart, weekEnd);
  const totals = sumWeekFuelFills(selectWeekFuelFills(entries as never));
  const mismatches: Array<Record<string, unknown>> = [];
  let clientSpend = 0;
  let clientRide = 0;
  let clientGas = 0;
  let clientCash = 0;
  let sawPay = false;
  for (const snap of args.snapshots) {
    const row = (snap && typeof snap === "object" ? snap : {}) as Record<string, unknown>;
    clientSpend += Number(row.totalGasCardCost) || Number(row.totalSpend) || 0;
    const cats = (row.categoryCosts || {}) as Record<string, unknown>;
    clientRide += Number(row.rideShareCost) || Number(cats.rideShareCost) || 0;
    if (row.gasCardSpend != null) {
      sawPay = true;
      clientGas += Number(row.gasCardSpend) || 0;
    }
    if (row.cashFromEarnings != null || row.totalCashCost != null) {
      sawPay = true;
      clientCash += Number(row.cashFromEarnings) || Number(row.totalCashCost) || 0;
    }
  }
  let serverRideShare: number | null = null;
  const version = Number(args.snapshotVersion) || 0;
  if (args.periodId && version > 0) {
    try {
      const { loadFuelWeekSnapshotVersion } = await import("./fuel_week_compute.ts");
      const loaded = await loadFuelWeekSnapshotVersion({
        orgId: args.orgId,
        periodId: args.periodId,
        version,
      });
      if (loaded.ok) {
        const reports = (loaded.row.money as { reports?: unknown[] } | null)?.reports || [];
        let ride = 0;
        let sawRide = false;
        for (const report of reports) {
          const row = (report && typeof report === "object" ? report : {}) as Record<string, unknown>;
          const cats = (row.categoryCosts || {}) as Record<string, unknown>;
          const value = Number(row.rideShareCost) || Number(cats.rideShareCost);
          if (Number.isFinite(value) && (row.rideShareCost != null || cats.rideShareCost != null)) {
            sawRide = true;
            ride += value;
          }
        }
        if (sawRide) serverRideShare = ride;
      }
    } catch (e) {
      console.warn("[fuel_spend_shadow] snapshot ride share unavailable", e);
    }
  }
  const deltas = diffFuelSpendAgainstFills({
    clientSpend,
    clientRideShare: clientRide,
    clientGasCard: sawPay ? clientGas : undefined,
    clientCash: sawPay ? clientCash : undefined,
    serverSpend: totals.totalSpend,
    serverGasCard: totals.gasCard,
    serverCash: totals.cash,
    serverRideShare,
  });
  if (deltas.length) {
    mismatches.push({ driverId: "*", authoritySource: "week_fills", deltas });
  }
  const force =
    args.forceClientMoney === true && String(args.forceReason || "").trim().length >= 8;
  const blocked = engineMode === "enforce" && mismatches.length > 0 && !force;
  return { blocked, mismatches };
}
