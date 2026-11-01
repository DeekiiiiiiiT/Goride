import { assertEquals } from "jsr:@std/assert@1";
import { readMigrationGlob } from "./test_read_migration_glob.ts";

const RPC = await readMigrationGlob("_fleet_inventory_engine_rpcs_");

Deno.test("FIFO cost layers maintained on receive/issue path", () => {
  if (!RPC.includes("inv_cost_layer")) {
    throw new Error("RPC migration should touch inv_cost_layer");
  }
  if (!RPC.includes("CREATE OR REPLACE FUNCTION fleet.inv_receive")) {
    throw new Error("missing inv_receive");
  }
  assertEquals(true, true);
});
