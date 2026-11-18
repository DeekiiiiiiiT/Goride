import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleListDriverDisputes,
  handleMarkDriverDisputeSent,
  mapDriverDisputeError,
  type DriverDisputesDeps,
} from "./toll_v2_driver_disputes_controller.ts";

function baseDeps(overrides: Partial<DriverDisputesDeps> = {}): DriverDisputesDeps {
  return {
    checkEnabled: async () => true,
    getOrg: () => "11111111-1111-4111-8111-111111111101",
    getUserId: () => "user-driver",
    resolveDriverId: async () => "driver-resolved",
    serviceRpc: async () => ({ data: { enabled: true, disputes: [] }, error: null }),
    assertDriverRole: () => ({ allowed: true }),
    ...overrides,
  };
}

Deno.test("driver disputes list: non-driver → 403", async () => {
  const r = await handleListDriverDisputes(baseDeps({
    assertDriverRole: () => ({
      allowed: false,
      status: 403,
      body: { error: "Forbidden" },
    }),
  }));
  assertEquals(r.status, 403);
});

Deno.test("driver disputes list: no driver → 400 DRIVER_NOT_FOUND", async () => {
  const r = await handleListDriverDisputes(baseDeps({
    resolveDriverId: async () => null,
  }));
  assertEquals(r.status, 400);
  assertEquals(r.body.code, "DRIVER_NOT_FOUND");
});

Deno.test("driver disputes list: RPC gets resolved driver id", async () => {
  let driverArg = "";
  await handleListDriverDisputes(baseDeps({
    serviceRpc: async (fn, args) => {
      if (fn === "toll_sys_driver_disputes") {
        driverArg = String(args.p_driver);
      }
      return { data: { enabled: true, disputes: [] }, error: null };
    },
  }));
  assertEquals(driverArg, "driver-resolved");
});

Deno.test("mapDriverDisputeError: window_closed → 409 with message", () => {
  const r = mapDriverDisputeError({ code: "P0001", message: "window_closed", details: '{"dispute_id":"x"}' }, 7);
  assertEquals(r.status, 409);
  assertEquals(r.body.code, "window_closed");
  assertEquals(r.body.message, "The 7 days to dispute this toll have passed");
});

Deno.test("mark sent: window_closed passes through mapped response", async () => {
  const r = await handleMarkDriverDisputeSent(
    baseDeps({
      serviceRpc: async () => ({
        data: null,
        error: { code: "P0001", message: "window_closed", details: "{}" },
      }),
    }),
    "dispute-1",
    { command_id: "cmd-1", expected_dispute_version: 1 },
  );
  assertEquals(r.status, 409);
  assertEquals(r.body.code, "window_closed");
});

Deno.test("mark sent: replay passes through success", async () => {
  const r = await handleMarkDriverDisputeSent(
    baseDeps({
      serviceRpc: async () => ({
        data: { replay: true, state: "sent" },
        error: null,
      }),
    }),
    "dispute-1",
    { command_id: "cmd-replay", expected_dispute_version: 2 },
  );
  assertEquals(r.status, 200);
  assertEquals(r.body.replay, true);
});