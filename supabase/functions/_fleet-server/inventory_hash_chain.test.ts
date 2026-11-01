import { assertEquals } from "jsr:@std/assert@1";
import { readMigrationGlob } from "./test_read_migration_glob.ts";

const RPC = await readMigrationGlob("_fleet_inventory_engine_rpcs_");

Deno.test("inv_verify_chain RPC exists", () => {
  if (!RPC.includes("CREATE OR REPLACE FUNCTION fleet.inv_verify_chain")) {
    throw new Error("missing inv_verify_chain");
  }
  assertEquals(true, true);
});

Deno.test("hash chain helper references sha256", () => {
  if (!/digest|sha256/i.test(RPC)) {
    throw new Error("expected pgcrypto sha256 in RPC migration");
  }
});
