/** Ledger invariant contracts documented in audit §6.2 / §11.1 (enforced in SQL migrations). */
import { assertEquals } from "jsr:@std/assert@1";

const SCHEMA = await Deno.readTextFile(
  new URL("../../../supabase/migrations/20261101143200_fleet_inventory_engine_schema.sql", import.meta.url),
);

Deno.test("inv_ledger is append-only in schema", () => {
  if (!/inv_ledger_immutable|BEFORE UPDATE OR DELETE ON fleet\.inv_ledger/i.test(SCHEMA)) {
    throw new Error("missing inv_ledger immutability trigger");
  }
  assertEquals(true, true);
});

Deno.test("inv_ledger hash chain columns exist", () => {
  for (const col of ["block_no", "prev_hash", "row_hash"]) {
    if (!SCHEMA.includes(col)) throw new Error(`missing ${col}`);
  }
});

Deno.test("organization_id NOT NULL on inv_movement", () => {
  if (!/fleet\.inv_movement[\s\S]*organization_id text NOT NULL/.test(SCHEMA)) {
    throw new Error("inv_movement.organization_id must be NOT NULL");
  }
});
