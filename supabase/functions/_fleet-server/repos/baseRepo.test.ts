import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveFleetColumn } from "./fleet_column_map.ts";
import { QUERY_FLEET_DEFAULT_ORDER, rowToKvValue } from "./baseRepo.ts";

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

// Typed trip_id is SSOT (F-26 / Gate 2) — stale payload_json must not win.
Deno.test("rowToKvValue prefers typed trip_id column over payload_json", () => {
  const payload = rowToKvValue({
    trip_id: "column-trip",
    payload_json: { tripId: "json-trip" },
  });
  assertEquals(payload.tripId, "column-trip");
});

Deno.test("rowToKvValue typed null trip_id clears stale payload tripId", () => {
  const payload = rowToKvValue({
    trip_id: null,
    payload_json: { tripId: "json-trip" },
  });
  assertEquals(payload.tripId, null);
});

Deno.test("queryFleet default order is updated_at DESC (N-04)", () => {
  assertEquals(QUERY_FLEET_DEFAULT_ORDER.col, "updated_at");
  assertEquals(QUERY_FLEET_DEFAULT_ORDER.ascending, false);
});
