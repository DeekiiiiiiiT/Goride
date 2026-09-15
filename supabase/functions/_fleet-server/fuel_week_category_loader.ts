/** Server-side categoryCosts from snapshot settledEntries + optional trip aggregates. */
import type { WeekSnapCategoryCosts } from "../../../packages/fuel-core/src/weekSnapshotEngine.ts";

export type FuelCategoryLoaderEntry = {
  amount: number;
  usageCategory?: string | null;
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
export function resolveEngineCategoryCosts(snap: Record<string, unknown>): {
  authority: WeekSnapCategoryCosts;
  snapCats: WeekSnapCategoryCosts | null;
  fromLoader: boolean;
} {
  const snapCats = snapCategoryCostsRaw(snap);
  const entries = settledEntriesFromSnap(snap);
  const tripAgg = tripAggFromSnap(snap);
  // N-15: untagged settledEntries are wallet evidence only — not category authority.
  const hasLoaderInputs = tripAgg != null || hasTaggedUsage(entries);
  if (hasLoaderInputs) {
    const tagged = entries.filter((e) => String(e.usageCategory || "").trim().length > 0);
    return {
      authority: categoryCostsFromEntriesAndTrips(tagged, tripAgg),
      snapCats,
      fromLoader: true,
    };
  }
  const fallback = snapCats ?? { ...EMPTY };
  return { authority: fallback, snapCats, fromLoader: false };
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
