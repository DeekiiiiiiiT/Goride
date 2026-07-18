import { assertEquals } from "https://deno.land/std@0.218.2/assert/mod.ts";
import {
  computeFinalFareFromRide,
  completionFinancialPatch,
} from "./computeFinalFare.ts";

Deno.test("computeFinalFareFromRide - basic fare calculation", () => {
  const ride = {
    fare_estimate_minor: 5000,
    wait_time_fee_minor: 200,
    actual_tolls_minor: 100,
    fare_breakdown: { estimated_tolls_minor: 50 },
  };

  const result = computeFinalFareFromRide(ride);
  if ("error" in result) throw new Error("unexpected error");

  // fareMinor = base (5000) + wait (200) + max(0, tollAdjust (50)) = 5250
  assertEquals(result.fareMinor, 5250);
  assertEquals(result.waitTimeFeeMinor, 200);
  assertEquals(result.actualTollsMinor, 100);
  assertEquals(result.tollAdjustment, 50);
});

Deno.test("computeFinalFareFromRide - negative toll adjustment capped at 0", () => {
  const ride = {
    fare_estimate_minor: 5000,
    wait_time_fee_minor: 0,
    actual_tolls_minor: 20,
    fare_breakdown: { estimated_tolls_minor: 100 },
  };

  const result = computeFinalFareFromRide(ride);
  if ("error" in result) throw new Error("unexpected error");

  // tollAdjustment = 20 - 100 = -80, capped at 0
  assertEquals(result.fareMinor, 5000);
  assertEquals(result.tollAdjustment, -80);
});

Deno.test("completionFinancialPatch - preserves existing tip", () => {
  const ride = {
    tip_minor: 500,
    platform_fee_minor: 0,
    payment_method: "card",
  };
  const fare = {
    fareMinor: 5000,
    waitTimeFeeMinor: 0,
    actualTollsMinor: 0,
    tollAdjustment: 0,
    fareFinalBreakdown: {},
  };

  const patch = completionFinancialPatch(ride, fare, "2026-01-15T10:00:00Z");

  assertEquals(patch.tip_minor, 500);
  assertEquals(patch.driver_net_minor, 5500); // fare + tip
});

Deno.test("completionFinancialPatch - preserves existing platform_fee", () => {
  const ride = {
    tip_minor: 0,
    platform_fee_minor: 750,
    payment_method: "card",
  };
  const fare = {
    fareMinor: 5000,
    waitTimeFeeMinor: 0,
    actualTollsMinor: 0,
    tollAdjustment: 0,
    fareFinalBreakdown: {},
  };

  const patch = completionFinancialPatch(ride, fare, "2026-01-15T10:00:00Z");

  assertEquals(patch.platform_fee_minor, 750);
  assertEquals(patch.driver_net_minor, 4250); // fare - platform_fee
});

Deno.test("completionFinancialPatch - preserves both tip and platform_fee", () => {
  const ride = {
    tip_minor: 300,
    platform_fee_minor: 500,
    payment_method: "card",
  };
  const fare = {
    fareMinor: 5000,
    waitTimeFeeMinor: 0,
    actualTollsMinor: 0,
    tollAdjustment: 0,
    fareFinalBreakdown: {},
  };

  const patch = completionFinancialPatch(ride, fare, "2026-01-15T10:00:00Z");

  assertEquals(patch.tip_minor, 300);
  assertEquals(patch.platform_fee_minor, 500);
  assertEquals(patch.driver_net_minor, 4800); // 5000 + 300 - 500
});

Deno.test("completionFinancialPatch - driver_net_minor never negative", () => {
  const ride = {
    tip_minor: 0,
    platform_fee_minor: 6000, // More than fare
    payment_method: "card",
  };
  const fare = {
    fareMinor: 5000,
    waitTimeFeeMinor: 0,
    actualTollsMinor: 0,
    tollAdjustment: 0,
    fareFinalBreakdown: {},
  };

  const patch = completionFinancialPatch(ride, fare, "2026-01-15T10:00:00Z");

  assertEquals(patch.driver_net_minor, 0); // Capped at 0
});

Deno.test("completionFinancialPatch - defaults to cash payment", () => {
  const ride = {
    tip_minor: 0,
    platform_fee_minor: 0,
  };
  const fare = {
    fareMinor: 5000,
    waitTimeFeeMinor: 0,
    actualTollsMinor: 0,
    tollAdjustment: 0,
    fareFinalBreakdown: {},
  };

  const patch = completionFinancialPatch(ride, fare, "2026-01-15T10:00:00Z");

  assertEquals(patch.payment_method, "cash");
});
