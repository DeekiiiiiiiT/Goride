import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveFleetColumn } from "./fleet_column_map.ts";
import { rowToKvValue } from "./baseRepo.ts";

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

Deno.test("rowToKvValue mirrors trip_id column into tripId", () => {
  const payload = rowToKvValue({
    id: "toll-1",
    trip_id: "ea510908-b6e7-4a49-9e18-14641d0d4fe5",
    payload_json: {},
  });
  assertEquals(payload.tripId, "ea510908-b6e7-4a49-9e18-14641d0d4fe5");
  assertEquals(payload.id, "toll-1");
});

Deno.test("rowToKvValue prefers payload_json tripId over column", () => {
  const payload = rowToKvValue({
    trip_id: "column-trip",
    payload_json: { tripId: "json-trip" },
  });
  assertEquals(payload.tripId, "json-trip");
});
