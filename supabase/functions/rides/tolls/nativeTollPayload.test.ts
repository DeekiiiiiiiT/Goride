import { assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildNativeCashSettled,
  buildNativeRideCharge,
  nativeTollCallsFor,
  rideRecordedByTollV2,
  type RideTollCrossingRow,
} from "./nativeTollPayload.ts";

const fleetRide = {
  id: "ride-1",
  organization_id: "org-1",
  attribution_mode: "fleet",
  payment_method: "card",
  assigned_driver_user_id: "drv-1",
  fare_breakdown: { estimated_tolls_minor: 150 },
};

Deno.test("nativeTollCallsFor — no org", () => {
  assertEquals(nativeTollCallsFor({ ...fleetRide, organization_id: null }, "completed"), []);
  assertEquals(nativeTollCallsFor({ ...fleetRide, organization_id: "" }, "completed"), []);
});

Deno.test("nativeTollCallsFor — independent", () => {
  assertEquals(
    nativeTollCallsFor({ ...fleetRide, attribution_mode: "independent" }, "completed"),
    [],
  );
});

Deno.test("nativeTollCallsFor — missing payment method", () => {
  assertEquals(nativeTollCallsFor({ ...fleetRide, payment_method: null }, "completed"), []);
  assertEquals(nativeTollCallsFor({ ...fleetRide, payment_method: "" }, "completed"), []);
});

Deno.test("nativeTollCallsFor — awaiting_cash cash", () => {
  assertEquals(
    nativeTollCallsFor({ ...fleetRide, payment_method: "cash" }, "awaiting_cash"),
    ["ride_charge"],
  );
});

Deno.test("nativeTollCallsFor — awaiting_cash card returns nothing", () => {
  assertEquals(nativeTollCallsFor(fleetRide, "awaiting_cash"), []);
});

Deno.test("nativeTollCallsFor — completed card", () => {
  assertEquals(nativeTollCallsFor(fleetRide, "completed"), ["ride_charge"]);
});

Deno.test("nativeTollCallsFor — completed cash settled", () => {
  assertEquals(
    nativeTollCallsFor({
      ...fleetRide,
      payment_method: "cash",
      cash_settlement_status: "settled",
    }, "completed"),
    ["ride_charge", "cash_settled"],
  );
});

Deno.test("nativeTollCallsFor — completed cash not settled", () => {
  assertEquals(
    nativeTollCallsFor({ ...fleetRide, payment_method: "cash" }, "completed"),
    ["ride_charge"],
  );
});

Deno.test("rideRecordedByTollV2 — matrix", () => {
  assertEquals(rideRecordedByTollV2(fleetRide), true);
  assertEquals(rideRecordedByTollV2({ ...fleetRide, organization_id: null }), false);
  assertEquals(rideRecordedByTollV2({ ...fleetRide, attribution_mode: "independent" }), false);
  assertEquals(rideRecordedByTollV2({ ...fleetRide, payment_method: "wallet" }), false);
  assertEquals(rideRecordedByTollV2({ ...fleetRide, payment_method: "" }), false);
});

Deno.test("buildNativeRideCharge — estimate and crossings shape", () => {
  const crossings: RideTollCrossingRow[] = [{
    id: "x1",
    toll_plaza_id: "plaza-a",
    toll_amount_minor: 200,
    crossed_at: "2024-06-01T12:00:00.000Z",
  }];
  const ride = {
    ...fleetRide,
    completed_at: "2024-06-01T13:00:00.000Z",
  };
  const payload = buildNativeRideCharge(ride, crossings, "veh-9");
  assertEquals(payload.estimated_tolls_minor, 150);
  assertEquals(payload.vehicle_id, "veh-9");
  assertEquals(payload.ended_at, "2024-06-01T13:00:00.000Z");
  const mapped = payload.crossings as Record<string, unknown>[];
  assertEquals(mapped.length, 1);
  assertEquals(mapped[0].plaza_id, "plaza-a");
  assertFalse("paid_by" in mapped[0]);
});

Deno.test("buildNativeRideCharge — ended_at fallbacks", () => {
  const noTs = buildNativeRideCharge(
    { ...fleetRide, completed_at: null, dropoff_arrived_at: null, fare_locked_at: "2024-01-02T00:00:00.000Z" },
    [],
    null,
  );
  assertEquals(noTs.ended_at, "2024-01-02T00:00:00.000Z");

  const dropoff = buildNativeRideCharge(
    { ...fleetRide, completed_at: null, dropoff_arrived_at: "2024-03-04T00:00:00.000Z" },
    [],
    null,
  );
  assertEquals(dropoff.ended_at, "2024-03-04T00:00:00.000Z");
});

Deno.test("buildNativeCashSettled — split with zero rider arrears maps to exact", () => {
  const payload = buildNativeCashSettled({
    id: "r2",
    cash_settlement_outcome: "split",
    rider_arrears_minor: 0,
    cash_received_minor: 800,
    fare_final_minor: 1000,
    wallet_paid_minor: 200,
    fare_breakdown: { estimated_tolls_minor: 50 },
    assigned_driver_user_id: "d1",
    settled_at: "2024-06-02T00:00:00.000Z",
  });
  assertEquals(payload.outcome, "exact");
});

Deno.test("buildNativeCashSettled — split with enough cash maps to exact", () => {
  const payload = buildNativeCashSettled({
    id: "r2b",
    cash_settlement_outcome: "split",
    cash_received_minor: 1000,
    fare_final_minor: 1000,
    fare_breakdown: { estimated_tolls_minor: 50 },
    assigned_driver_user_id: "d1",
    settled_at: "2024-06-02T00:00:00.000Z",
  });
  assertEquals(payload.outcome, "exact");
  assertEquals(payload.estimated_tolls_minor, 50);
});

Deno.test("buildNativeCashSettled — split with too little cash maps to underpay", () => {
  const payload = buildNativeCashSettled({
    id: "r3",
    cash_settlement_outcome: "split",
    cash_received_minor: 500,
    fare_final_minor: 1000,
    fare_breakdown: {},
    assigned_driver_user_id: "d1",
  });
  assertEquals(payload.outcome, "underpay");
});

Deno.test("buildNativeCashSettled — missing outcome only exact when settled", () => {
  const settled = buildNativeCashSettled({
    id: "r5",
    cash_settlement_status: "settled",
    fare_final_minor: 1000,
    fare_breakdown: {},
    assigned_driver_user_id: "d1",
  });
  assertEquals(settled.outcome, "exact");
  const pending = buildNativeCashSettled({
    id: "r6",
    cash_settlement_status: "pending",
    fare_final_minor: 1000,
    fare_breakdown: {},
    assigned_driver_user_id: "d1",
  });
  assertEquals(pending.outcome, "underpay");
});

Deno.test("buildNativeCashSettled — settled_at fallback", () => {
  const payload = buildNativeCashSettled({
    id: "r4",
    cash_settlement_outcome: "exact",
    completed_at: "2024-07-01T00:00:00.000Z",
    fare_breakdown: {},
    assigned_driver_user_id: "d1",
  });
  assertEquals(payload.settled_at, "2024-07-01T00:00:00.000Z");
});
