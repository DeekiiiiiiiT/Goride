import { assertEquals } from "jsr:@std/assert@1";
import { readMigrationGlob } from "./test_read_migration_glob.ts";

const RPC = await readMigrationGlob("_fleet_inventory_engine_rpcs_");

Deno.test("write-off / adjust reference approval threshold", () => {
  if (!RPC.includes("approval_threshold_jmd")) {
    throw new Error("expected approval threshold read from inv_settings");
  }
  assertEquals(true, true);
});
