/** R12/R13: inv_receive must write supplier offset legs. */
import { assertEquals } from "jsr:@std/assert@1";

const R13 = await Deno.readTextFile(
  new URL(
    "../../../supabase/migrations/20261101205000_fleet_inventory_r13_fifo_layers.sql",
    import.meta.url,
  ),
);

Deno.test("inv_receive writes virtual supplier offset in R13 migration", () => {
  const receiveBlock = R13.match(
    /CREATE OR REPLACE FUNCTION fleet\.inv_receive[\s\S]*?\$\$;/,
  )?.[0];
  if (!receiveBlock) throw new Error("missing inv_receive in R13 migration");
  if (!receiveBlock.includes("_inv_virtual_location_id")) {
    throw new Error("inv_receive must resolve V-SUPPLIER");
  }
  const legCalls = receiveBlock.match(/_inv_append_ledger_leg/g) ?? [];
  if (legCalls.length < 2) {
    throw new Error("inv_receive must append at least two ledger legs per line");
  }
  assertEquals(true, true);
});
