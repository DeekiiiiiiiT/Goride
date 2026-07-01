import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateTollCrossings,
  ROUND_TRIP_COOLDOWN_MS,
} from "./tollGeofence.ts";
import { invalidateTollPlazaCache } from "./tollPlazaLoader.ts";

/** Mock db that returns the given plaza KV rows from the loader's query. */
function mockDb(plazaRows: Array<{ key: string; value: unknown }>) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        like: async (_col: string, _pat: string) => ({ data: plazaRows, error: null }),
      }),
    }),
  } as unknown as import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient;
}

function plaza(id: string, lat: number, lng: number, radius: number, amount: number) {
  return {
    key: `toll_plaza:${id}`,
    value: {
      name: id,
      location: { lat, lng },
      geofenceRadius: radius,
      rates: [{ vehicleClass: "standard", amount, currency: "JMD" }],
      status: "active",
    },
  };
}

const PLAZA_LAT = 18.0;
const PLAZA_LNG = -76.8;
// ~100 m north of the plaza (0.0009 deg latitude ≈ 100 m).
const DRIVER_100M_LAT = 18.0009;

Deno.test("uses per-plaza radius, not max(global, plaza) — no false positive", async () => {
  invalidateTollPlazaCache();
  const db = mockDb([plaza("t1", PLAZA_LAT, PLAZA_LNG, 50, 3)]);
  // Driver ~100 m away, plaza radius 50 m, global radius 500 m.
  // Old Math.max(500,50)=500 would (wrongly) detect; new per-plaza 50 must not.
  const res = await evaluateTollCrossings(db, DRIVER_100M_LAT, PLAZA_LNG, 500, new Set());
  assertEquals(res.tollsCrossed.length, 0);
});

Deno.test("detects when within the plaza's own radius", async () => {
  invalidateTollPlazaCache();
  const db = mockDb([plaza("t1", PLAZA_LAT, PLAZA_LNG, 200, 3)]);
  const res = await evaluateTollCrossings(db, DRIVER_100M_LAT, PLAZA_LNG, 50, new Set());
  assertEquals(res.tollsCrossed.length, 1);
  assertEquals(res.totalTollsMinor, 300);
});

Deno.test("skips plazas with no positive rate (misconfigured)", async () => {
  invalidateTollPlazaCache();
  const db = mockDb([plaza("t1", PLAZA_LAT, PLAZA_LNG, 200, 0)]);
  const res = await evaluateTollCrossings(db, PLAZA_LAT, PLAZA_LNG, 200, new Set());
  assertEquals(res.tollsCrossed.length, 0);
});

Deno.test("cooldown mode skips a re-cross within the cooldown window", async () => {
  invalidateTollPlazaCache();
  const db = mockDb([plaza("t1", PLAZA_LAT, PLAZA_LNG, 200, 3)]);
  const now = 1_000_000_000_000;
  const recentByPlaza = new Map<string, number>([["t1", now - 60_000]]); // 1 min ago
  const res = await evaluateTollCrossings(db, PLAZA_LAT, PLAZA_LNG, 200, new Set(), {
    recentByPlaza,
    nowMs: now,
  });
  assertEquals(res.tollsCrossed.length, 0);
});

Deno.test("cooldown mode re-counts after the cooldown elapses (round trip)", async () => {
  invalidateTollPlazaCache();
  const db = mockDb([plaza("t1", PLAZA_LAT, PLAZA_LNG, 200, 3)]);
  const now = 1_000_000_000_000;
  const recentByPlaza = new Map<string, number>([["t1", now - (ROUND_TRIP_COOLDOWN_MS + 60_000)]]);
  const res = await evaluateTollCrossings(db, PLAZA_LAT, PLAZA_LNG, 200, new Set(), {
    recentByPlaza,
    nowMs: now,
  });
  assertEquals(res.tollsCrossed.length, 1);
});
