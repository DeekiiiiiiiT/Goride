import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import {
  buildFuelWeekHashParts,
  fuelSnapshotMoneyKey,
  fuelSnapshotWritePlan,
  shouldReuseFuelSnapshot,
  snapshotRoutingFailed,
  type FuelWeekHashSources,
} from "./fuel_week_compute.ts";

function sources(patch: Partial<FuelWeekHashSources> = {}): FuelWeekHashSources {
  return {
    entries: [{ id: "e1", amount: 100, odometer: 10, liters: 4, type: "Card" }],
    trips: [{ id: "t1", distance: 12, status: "Completed" }],
    adjustments: [],
    scenarios: [],
    policies: [],
    drivers: [{ id: "d1", fuelScenarioId: "s1" }],
    vehicles: [{ id: "v1", currentDriverId: "d1" }],
    prefs: { personalAllowance: { weeklyKm: 50 } },
    fareFingerprintParts: [],
    distances: [{ vehicle_id: "v1", deadhead_km: 1, trip_km: 12, personal_km: 0, stale: false }],
    anchors: [],
    ...patch,
  };
}

Deno.test("fuel week hash changes when an adjustment changes", () => {
  const before = buildFuelWeekHashParts(sources()).join("|");
  const after = buildFuelWeekHashParts(sources({
    adjustments: [{ id: "a1", date: "2026-10-07", type: "Personal", vehicleId: "v1", distance: 15 }],
  })).join("|");
  assertNotEquals(before, after);
});

Deno.test("empty distance week stores the hash after prepare writes rows", () => {
  const before = buildFuelWeekHashParts(sources({ distances: [] })).join("|");
  const saved = buildFuelWeekHashParts(sources({
    distances: [{ vehicle_id: "v1", deadhead_km: 1, trip_km: 12, personal_km: 0, stale: false }],
  })).join("|");
  assertNotEquals(before, saved);
  const first = fuelSnapshotWritePlan({ latestHash: null, beforeHash: before, afterHash: saved });
  assertEquals(first.reuse, false);
  assertEquals(first.hash, saved);
  const again = fuelSnapshotWritePlan({ latestHash: saved, beforeHash: saved, afterHash: saved });
  assertEquals(again.reuse, true);
  assertEquals(again.hash, saved);
});

Deno.test("fuel week hash changes when a prior week or a home pin changes", () => {
  const base = buildFuelWeekHashParts(sources({
    priorWeeks: [{
      weekStart: "2026-09-28",
      status: "open",
      version: 2,
      engineVersion: "fuel-chain-v2.1",
      variances: [{ driverId: "d1", vehicleId: "v1", miscellaneousCost: -100 }],
    }],
  })).join("|");
  const recomputed = buildFuelWeekHashParts(sources({
    priorWeeks: [{
      weekStart: "2026-09-28",
      status: "open",
      version: 3,
      engineVersion: "fuel-chain-v2.1",
      variances: [{ driverId: "d1", vehicleId: "v1", miscellaneousCost: -250 }],
    }],
  })).join("|");
  const locked = buildFuelWeekHashParts(sources({
    priorWeeks: [{
      weekStart: "2026-09-28",
      status: "locked",
      version: 3,
      engineVersion: "fuel-chain-v2.1",
      variances: [{ driverId: "d1", vehicleId: "v1", miscellaneousCost: -250 }],
    }],
  })).join("|");
  assertNotEquals(base, recomputed);
  assertNotEquals(recomputed, locked);
  const noHome = buildFuelWeekHashParts(sources()).join("|");
  const withHome = buildFuelWeekHashParts(sources({
    drivers: [{ id: "d1", fuelScenarioId: "s1", homeLat: 18.01, homeLng: -76.8, homePinSource: "home" }],
  })).join("|");
  assertNotEquals(noHome, withHome);
});

Deno.test("a failed route snapshot is retried, and a second failure is not copied", () => {
  assertEquals(snapshotRoutingFailed({
    reports: [{ metadata: { routingHealth: { ok: false } } }],
  }), true);
  assertEquals(snapshotRoutingFailed({
    reports: [{ metadata: { routingHealth: { ok: true } } }],
  }), false);
  assertEquals(shouldReuseFuelSnapshot({
    planReuse: true,
    savedRoutingFailed: true,
    freshRoutingFailed: false,
  }), false);
  assertEquals(shouldReuseFuelSnapshot({
    planReuse: true,
    savedRoutingFailed: true,
    freshRoutingFailed: true,
  }), true);
  assertEquals(shouldReuseFuelSnapshot({
    planReuse: true,
    savedRoutingFailed: false,
    freshRoutingFailed: false,
  }), true);
});

Deno.test("same fuel totals stay lockable when only the fingerprint moved", () => {
  const saved = {
    totalSpend: 30300,
    reports: [{
      vehicleId: "5179KZ",
      totalGasCardCost: 30300,
      driverShare: 2631.694703810315,
      companyShare: 27668.305296189686,
      miscellaneousCost: 0,
    }],
  };
  const rebuilt = {
    totalSpend: 30300.004,
    reports: [{
      vehicleId: "5179KZ",
      totalGasCardCost: "30300",
      driverShare: 2631.69,
      companyShare: 27668.31,
      miscellaneousCost: 0,
    }],
  };
  assertEquals(fuelSnapshotMoneyKey(saved), fuelSnapshotMoneyKey(rebuilt));
  const moved = {
    ...rebuilt,
    reports: [{ ...rebuilt.reports[0], driverShare: 2700 }],
  };
  assertNotEquals(fuelSnapshotMoneyKey(saved), fuelSnapshotMoneyKey(moved));
});

Deno.test("fuel week hash ignores distance computed_at", () => {
  const a = buildFuelWeekHashParts(sources({
    distances: [{ vehicle_id: "v1", deadhead_km: 1, trip_km: 12, personal_km: 0, stale: false, computed_at: "2026-10-01" }],
  })).join("|");
  const b = buildFuelWeekHashParts(sources({
    distances: [{ vehicle_id: "v1", deadhead_km: 1, trip_km: 12, personal_km: 0, stale: false, computed_at: "2026-10-21" }],
  })).join("|");
  assertEquals(a, b);
});
