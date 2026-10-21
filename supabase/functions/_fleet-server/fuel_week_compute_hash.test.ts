import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import {
  buildFuelWeekHashParts,
  fuelSnapshotWritePlan,
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
    fares: [],
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

Deno.test("fuel week hash ignores distance computed_at", () => {
  const a = buildFuelWeekHashParts(sources({
    distances: [{ vehicle_id: "v1", deadhead_km: 1, trip_km: 12, personal_km: 0, stale: false, computed_at: "2026-10-01" }],
  })).join("|");
  const b = buildFuelWeekHashParts(sources({
    distances: [{ vehicle_id: "v1", deadhead_km: 1, trip_km: 12, personal_km: 0, stale: false, computed_at: "2026-10-21" }],
  })).join("|");
  assertEquals(a, b);
});
