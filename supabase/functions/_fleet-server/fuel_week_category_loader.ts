/** Server-side categoryCosts from snapshot settledEntries + optional trip aggregates. */
import type { WeekSnapCategoryCosts } from "../../../packages/fuel-core/src/weekSnapshotEngine.ts";

export type FuelCategoryLoaderEntry = {
  amount: number;
  usageCategory?: string | null;
  driverId?: string | null;
  vehicleId?: string | null;
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
    // Untargeted rows (no driver/vehicle on entry) never become authority.
    return false;
  });

  // Phase 4: server week entries with usage tags are independent of client stamp.
  if (serverTagged.length > 0) {
    return {
      authority: categoryCostsFromEntriesAndTrips(serverTagged, null),
      snapCats,
      fromLoader: true,
      authoritySource: "server_entries",
    };
  }

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

/** Phase 4: load org-week fuel entries that carry usageCategory for independent authority. */
export async function loadServerTaggedFuelEntriesForWeek(
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
      const usage = (v.usageCategory ?? v.usage_category ?? null) as string | null;
      if (!String(usage || "").trim()) continue;
      out.push({
        amount: Number(v.amount) || 0,
        usageCategory: usage,
        driverId: (v.driverId ?? v.driver_id ?? null) as string | null,
        vehicleId: (v.vehicleId ?? v.vehicle_id ?? null) as string | null,
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
