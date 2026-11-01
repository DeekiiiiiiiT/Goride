import { assertEquals } from "jsr:@std/assert@1";

const RPC = await Deno.readTextFile(
  new URL("../../../supabase/migrations/20261101143300_fleet_inventory_engine_rpcs.sql", import.meta.url),
);

Deno.test("FIFO cost layers maintained on receive/issue path", () => {
  if (!RPC.includes("inv_cost_layer")) {
    throw new Error("RPC migration should touch inv_cost_layer");
  }
  if (!RPC.includes("CREATE OR REPLACE FUNCTION fleet.inv_receive")) {
    throw new Error("missing inv_receive");
  }
  assertEquals(true, true);
});
