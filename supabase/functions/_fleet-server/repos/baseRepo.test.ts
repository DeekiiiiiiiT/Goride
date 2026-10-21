import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveFleetColumn } from "./fleet_column_map.ts";
import { QUERY_FLEET_DEFAULT_ORDER, isFuelQueueTransactionRow, rowToKvValue, shapeFleetRow } from "./baseRepo.ts";

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

Deno.test("rowToKvValue mirrors typed trip columns when payload is empty", () => {
  const payload = rowToKvValue({
    id: "t1",
    platform: "Uber",
    status: "Completed",
    amount: 1200,
    service_line: "rideshare",
    distance: 12.5,
    duration: 18,
    payload_json: {},
  });
  assertEquals(payload.platform, "Uber");
  assertEquals(payload.status, "Completed");
  assertEquals(payload.amount, 1200);
  assertEquals(payload.serviceLine, "rideshare");
  assertEquals(payload.distance, 12.5);
  assertEquals(payload.duration, 18);
});

Deno.test("rowToKvValue keeps payload platform when the blob is present", () => {
  const payload = rowToKvValue({
    platform: "Uber",
    payload_json: { platform: "Roam Rush" },
  });
  assertEquals(payload.platform, "Roam Rush");
});

Deno.test("shapeFleetRow keeps named JSON fields and hides the blob", () => {
  const payload = shapeFleetRow({
    id: "t1",
    driver_id: "d1",
    date: "2026-10-01",
    platform: "Uber",
    status: "Completed",
    amount: 500,
    service_line: "rideshare",
    tollCharges: 275,
    dropoffTime: "2026-10-01T18:00:00Z",
    tollRefundResolution: { status: "pending" },
    metaTripId: "trip-9",
  });
  assertEquals(payload.tollCharges, 275);
  assertEquals(payload.dropoffTime, "2026-10-01T18:00:00Z");
  assertEquals((payload.tollRefundResolution as { status: string }).status, "pending");
  assertEquals((payload.metadata as { tripId: string }).tripId, "trip-9");
  assertEquals(payload.platform, "Uber");
  assertEquals(payload.driverId, "d1");
  assertEquals("payload_json" in payload, false);
});

Deno.test("shapeFleetRow keeps fuel-queue aliases and drops receipt blobs", () => {
  const payload = shapeFleetRow({
    id: "tx1",
    date: "2026-04-24",
    driver_id: "d1",
    type: "Expense",
    category: "Fuel",
    amount: -12.5,
    status: "Pending",
    description: "Fuel expense",
    paymentMethod: "Cash",
    driverName: "Ada",
    quantity: 8,
    odometer: 12000,
    metadata: { source: "Fuel Log", receiptBase64: "abc", stationGateHold: false },
  });
  assertEquals(payload.driverName, "Ada");
  assertEquals(payload.quantity, 8);
  assertEquals(payload.paymentMethod, "Cash");
  assertEquals((payload.metadata as { source: string }).source, "Fuel Log");
  assertEquals("receiptBase64" in (payload.metadata as object), false);
  const full = shapeFleetRow({
    id: "tx2",
    payload_json: { metadata: { receiptBase64: "keep", source: "Manual" } },
  });
  assertEquals((full.metadata as { receiptBase64: string }).receiptBase64, "keep");
});

Deno.test("isFuelQueueTransactionRow matches fuel categories and manual fuel", () => {
  assertEquals(isFuelQueueTransactionRow({ category: "Fuel Reimbursement Credit", type: "Expense" }), true);
  assertEquals(isFuelQueueTransactionRow({ category: "Cash Collection", type: "Payment_Received" }), false);
  assertEquals(isFuelQueueTransactionRow({ category: "Other", type: "Fuel_Manual_Entry" }), true);
});

Deno.test("queryFleet default order is updated_at DESC (N-04)", () => {
  assertEquals(QUERY_FLEET_DEFAULT_ORDER.col, "updated_at");
  assertEquals(QUERY_FLEET_DEFAULT_ORDER.ascending, false);
});
