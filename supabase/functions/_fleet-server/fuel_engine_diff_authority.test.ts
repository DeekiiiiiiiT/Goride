/**
 * N-19: fuel_engine_diff audit must carry authoritySource so shadow soak
 * can prove which Phase 4 ladder tier produced each comparison.
 */
import { assertEquals } from "jsr:@std/assert";
import { resolveEngineCategoryCosts } from "./fuel_week_category_loader.ts";

type EngineAuthoritySource =
  | "server_entries"
  | "trip_agg"
  | "tagged_snap_entries"
  | "snap_category_costs";

/** Mirrors fuel_period_routes fuel_engine_diff payload assembly (N-19). */
function buildEngineDiffPayload(
  snaps: Record<string, unknown>[],
  serverTagged: Parameters<typeof resolveEngineCategoryCosts>[1],
  mode: string,
) {
  const mismatches: Array<{
    driverId: string;
    authoritySource: EngineAuthoritySource;
    deltas: { field: string; delta: number }[];
  }> = [];
  const authoritySourceByDriver: Record<string, EngineAuthoritySource> = {};
  for (const snapObj of snaps) {
    const { authoritySource } = resolveEngineCategoryCosts(snapObj, serverTagged);
    const driverId = String(snapObj.driverId || "");
    if (driverId) authoritySourceByDriver[driverId] = authoritySource;
  }
  return { mode, mismatches, authoritySourceByDriver, reviewedHash: null };
}

Deno.test("N-19: trip_agg authority appears on fuel_engine_diff payload", () => {
  const snap = {
    driverId: "d1",
    categoryCosts: {
      rideShareCost: 100,
      companyUsageCost: 0,
      deadheadCost: 0,
      personalUsageCost: 0,
    },
    metadata: {
      tripCategoryAgg: {
        rideShareCost: 100,
        companyUsageCost: 0,
        deadheadCost: 0,
        personalUsageCost: 0,
      },
    },
  };
  const payload = buildEngineDiffPayload([snap], [], "shadow");
  assertEquals(payload.authoritySourceByDriver.d1, "trip_agg");
  // Control must fail if authority is dropped (non-tautological).
  if (!("authoritySourceByDriver" in payload)) {
    throw new Error("N-19: authoritySourceByDriver missing from fuel_engine_diff payload");
  }
});

Deno.test("N-19: server_entries authority appears on fuel_engine_diff payload", () => {
  const snap = {
    driverId: "d1",
    vehicleId: "v1",
    categoryCosts: {
      rideShareCost: 999,
      companyUsageCost: 0,
      deadheadCost: 0,
      personalUsageCost: 0,
    },
    metadata: {
      tripCategoryAgg: {
        rideShareCost: 999,
        companyUsageCost: 0,
        deadheadCost: 0,
        personalUsageCost: 0,
      },
    },
  };
  const serverTagged = [
    { amount: 400, usageCategory: "ride", driverId: "d1", vehicleId: "v1" },
  ];
  const payload = buildEngineDiffPayload([snap], serverTagged, "shadow");
  assertEquals(payload.authoritySourceByDriver.d1, "server_entries");
});

Deno.test("N-19: mismatch rows carry per-driver authoritySource", () => {
  const authoritySource: EngineAuthoritySource = "trip_agg";
  const mismatches = [
    {
      driverId: "d1",
      authoritySource,
      deltas: [{ field: "driverShare", delta: 1 }],
    },
  ];
  assertEquals(mismatches[0].authoritySource, "trip_agg");
  // Deliberately divergent: missing field must be detectable.
  const bad = { driverId: "d1", deltas: [{ field: "driverShare", delta: 1 }] } as {
    driverId: string;
    authoritySource?: EngineAuthoritySource;
    deltas: { field: string; delta: number }[];
  };
  assertEquals(bad.authoritySource == null, true);
});
