import { assertEquals } from "jsr:@std/assert@1";

const S02_CUTDOWN = await Deno.readTextFile(
  new URL(
    "../../../supabase/migrations/20261106132300_fleet_inventory_s02_cutdown.sql",
    import.meta.url,
  ),
);

function extractInvWriteOff(sql: string): string {
  const marker = "CREATE OR REPLACE FUNCTION fleet.inv_write_off(";
  const start = sql.indexOf(marker);
  if (start === -1) {
    throw new Error("missing fleet.inv_write_off in 20261106132300_fleet_inventory_s02_cutdown.sql");
  }
  const slice = sql.slice(start);
  const end = slice.indexOf("\n$$;");
  if (end === -1) throw new Error("could not parse inv_write_off body");
  return slice.slice(0, end + 4);
}

const INV_WRITE_OFF = extractInvWriteOff(S02_CUTDOWN);

Deno.test("Rev 52 inv_write_off has no pending_approval gate", () => {
  if (INV_WRITE_OFF.includes("pending_approval")) {
    throw new Error("inv_write_off must not reference pending_approval after Rev 52 cutdown");
  }
  assertEquals(true, true);
});
