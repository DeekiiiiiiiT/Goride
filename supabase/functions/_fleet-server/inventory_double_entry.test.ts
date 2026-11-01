/** R12: inv_receive must write supplier offset legs (see 20261101182842 migration). */
import { assertEquals } from "jsr:@std/assert@1";

const R12 = await Deno.readTextFile(
  new URL("../../../supabase/migrations/20261101182842_fleet_inventory_r12_double_entry_and_phone_repair.sql", import.meta.url),
);

Deno.test("inv_receive writes virtual supplier offset in R12 migration", () => {
  const receiveBlock = R12.match(
    /CREATE OR REPLACE FUNCTION fleet\.inv_receive[\s\S]*?\$\$;/,
  )?.[0];
  if (!receiveBlock) throw new Error("missing inv_receive in R12 migration");
  if (!receiveBlock.includes("_inv_virtual_location_id")) {
    throw new Error("inv_receive must resolve V-SUPPLIER");
  }
  const legCalls = receiveBlock.match(/_inv_append_ledger_leg/g) ?? [];
  if (legCalls.length < 2) {
    throw new Error("inv_receive must append at least two ledger legs per line");
  }
  assertEquals(true, true);
});
