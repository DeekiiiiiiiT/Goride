import { assertEquals } from "jsr:@std/assert@1";

const SRC = await Deno.readTextFile(
  new URL("./inventory_controller.tsx", import.meta.url),
);

Deno.test("driver report POST accepts idempotency key", () => {
  const block = SRC.slice(SRC.indexOf("/driver/reports"), SRC.indexOf("/driver/reports/:id"));
  if (!block.includes("requireIdempotencyKey")) {
    throw new Error("driver report POST must require Idempotency-Key");
  }
  assertEquals(true, true);
});

Deno.test("inv_driver_report table exists in schema", async () => {
  const schema = await Deno.readTextFile(
    new URL("../../../supabase/migrations/20261101143200_fleet_inventory_engine_schema.sql", import.meta.url),
  );
  if (!schema.includes("fleet.inv_driver_report")) {
    throw new Error("missing inv_driver_report table");
  }
});
