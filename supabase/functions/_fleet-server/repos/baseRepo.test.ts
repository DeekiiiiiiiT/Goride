import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveFleetColumn } from "./fleet_column_map.ts";

Deno.test("typed aliases win over JSON paths", () => {
  assertEquals(resolveFleetColumn("value->>transactionId"), "transaction_id");
  assertEquals(resolveFleetColumn("transactionId"), "transaction_id");
  assertEquals(resolveFleetColumn("vehicleId"), "vehicle_id");
  assertEquals(resolveFleetColumn("value->>status"), "status");
});

Deno.test("unaliased JSON paths map onto payload_json instead of dropping", () => {
  assertEquals(
    resolveFleetColumn("value->metadata->>originalTransactionId"),
    "payload_json->metadata->>originalTransactionId",
  );
  assertEquals(resolveFleetColumn("value->>anchorPeriodId"), "payload_json->>anchorPeriodId");
});

Deno.test("unknown dotted paths stay unmapped (caller must fail, not skip)", () => {
  assertEquals(resolveFleetColumn("value.foo.bar"), null);
});
