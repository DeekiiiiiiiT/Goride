/**
 * Run: deno test supabase/functions/_fleet-server/trip_save_dedupe.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAppLoggedTrip, loggedTripSignature } from "./trip_save_dedupe.ts";

const live = {
  id: "manual_664e9f4d",
  isManual: false,
  batchId: "live_driver_app",
  driverId: "driver-1",
  amount: 2500,
  pickupLocation: "Hellshire Beach, Hellshire, Jamaica",
  requestTime: "2026-10-03T18:06:00.000Z",
  date: "2026-10-03T18:06:00.000Z",
};

Deno.test("live driver recordings count as app-logged trips", () => {
  assertEquals(isAppLoggedTrip(live), true);
  assertEquals(isAppLoggedTrip({ id: "uber-1", isManual: false, batchId: "uber_csv" }), false);
  assertEquals(isAppLoggedTrip({ id: "m1", isManual: true, batchId: "manual_entry" }), true);
});

Deno.test("same driver, start, amount, and pickup share a signature", () => {
  const again = {
    ...live,
    id: "manual_dee530d3",
    requestTime: "2026-10-03T18:06:00Z",
  };
  assertEquals(loggedTripSignature(live), loggedTripSignature(again));
  assertEquals(loggedTripSignature({ ...live, amount: 2600 }) === loggedTripSignature(live), false);
  assertEquals(loggedTripSignature({ ...live, pickupLocation: "" }), null);
});
