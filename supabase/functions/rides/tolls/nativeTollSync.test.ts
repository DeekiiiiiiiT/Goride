import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  makeNativeTollSyncDeps,
  syncNativeTollsWithDeps,
  type NativeTollSyncDeps,
} from "./nativeTollSync.ts";

const fleetCashRide = {
  id: "ride-cash",
  organization_id: "00000000-0000-4000-8000-000000000001",
  attribution_mode: "fleet",
  payment_method: "cash",
  assigned_driver_user_id: "drv-1",
  fare_final_minor: 2000,
  cash_received_minor: 2000,
  cash_settlement_status: "settled",
  fare_breakdown: { estimated_tolls_minor: 100 },
  completed_at: "2024-06-01T12:00:00.000Z",
};

Deno.test("syncNativeTollsWithDeps — independent ride makes no RPC calls", async () => {
  const calls: string[] = [];
  const deps: NativeTollSyncDeps = {
    loadCrossings: async () => [],
    resolveVehicleId: async () => null,
    callRpc: async (fn) => {
      calls.push(fn);
      return { error: null };
    },
  };
  await syncNativeTollsWithDeps(deps, {
    ...fleetCashRide,
    attribution_mode: "independent",
  }, "completed");
  assertEquals(calls, []);
});

Deno.test("syncNativeTollsWithDeps — completed cash not settled only ride_charge", async () => {
  const calls: string[] = [];
  const deps: NativeTollSyncDeps = {
    loadCrossings: async () => [],
    resolveVehicleId: async () => null,
    callRpc: async (fn) => {
      calls.push(fn);
      return { error: null };
    },
  };
  await syncNativeTollsWithDeps(deps, {
    ...fleetCashRide,
    cash_settlement_status: "pending",
  }, "completed");
  assertEquals(calls, ["toll_sys_native_ride_charge"]);
});

Deno.test("syncNativeTollsWithDeps — completed cash calls ride_charge then cash_settled", async () => {
  const calls: string[] = [];
  const deps: NativeTollSyncDeps = {
    loadCrossings: async () => [{
      id: "c1",
      toll_plaza_id: "p1",
      toll_amount_minor: 100,
      crossed_at: "2024-06-01T11:00:00.000Z",
    }],
    resolveVehicleId: async () => "veh-1",
    callRpc: async (fn) => {
      calls.push(fn);
      return { error: null };
    },
  };
  await syncNativeTollsWithDeps(deps, fleetCashRide, "completed");
  assertEquals(calls, ["toll_sys_native_ride_charge", "toll_sys_native_cash_settled"]);
});

Deno.test("syncNativeTollsWithDeps — RPC error is caught without throwing", async () => {
  const logs: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    const deps: NativeTollSyncDeps = {
      loadCrossings: async () => [],
      resolveVehicleId: async () => null,
      callRpc: async () => ({
        error: { code: "42501", message: "permission denied" },
      }),
    };
    await syncNativeTollsWithDeps(deps, {
      ...fleetCashRide,
      payment_method: "card",
    }, "completed");
    assertEquals(logs.length, 1);
    const line = logs[0] as unknown[];
    assertEquals(line[0], "[toll-v2] native sync failed");
    const meta = line[1] as Record<string, unknown>;
    assertEquals(meta.rideId, "ride-cash");
    assertEquals(meta.moment, "completed");
    assertEquals(meta.code, "42501");
  } finally {
    console.error = originalError;
  }
});

Deno.test("makeNativeTollSyncDeps — wires loadCrossings to ride id", async () => {
  let queriedRideId = "";
  const ridesDb = {
    from: () => ({
      select: () => ({
        eq: (_col: string, rideId: string) => {
          queriedRideId = rideId;
          return Promise.resolve({ data: [], error: null });
        },
      }),
    }),
  } as unknown as import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient;

  const deps = makeNativeTollSyncDeps(ridesDb, ridesDb);
  await syncNativeTollsWithDeps(deps, fleetCashRide, "completed");
  assertEquals(queriedRideId, "ride-cash");
});
