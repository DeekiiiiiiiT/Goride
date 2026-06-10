import { assertEquals } from "https://deno.land/std@0.218.2/assert/mod.ts";
import {
  sanitizeActivityIntentForTargetBooker,
  sanitizeActivityRideForBooker,
  sanitizeRideForShadowBooker,
} from "./shadowBookerPrivacy.ts";

Deno.test("sanitizeRideForShadowBooker strips operational and PII keys", () => {
  const ride = {
    id: "ride-1",
    status: "on_trip",
    roam_mode: "shadow_roam",
    guest_passenger_name: "Alex",
    guest_passenger_phone: "+18761234567",
    passenger_user_id: "passenger-uuid",
    pickup_address: "Secret St",
    pickup_lat: 18.0,
    eta_pickup_seconds_estimate: 420,
    assigned_driver_user_id: "driver-uuid",
    verification_pin: "1234",
    fare_estimate_minor: "2500",
  };
  const out = sanitizeRideForShadowBooker(ride)!;
  assertEquals(out.guest_passenger_name, "Alex");
  assertEquals(out.status, "on_trip");
  assertEquals("pickup_address" in out, false);
  assertEquals("eta_pickup_seconds_estimate" in out, false);
  assertEquals("assigned_driver_user_id" in out, false);
  assertEquals("guest_passenger_phone" in out, false);
  assertEquals("passenger_user_id" in out, false);
  assertEquals("verification_pin" in out, false);
});

Deno.test("sanitizeActivityRideForBooker — shadow nulls addresses, open unchanged", () => {
  const shadow = sanitizeActivityRideForBooker({
    kind: "ride",
    roam_mode: "shadow_roam",
    pickup_address: "Secret St",
    dropoff_address: "Hidden Ave",
    counterparty_name: "Alex",
  });
  assertEquals(shadow.pickup_address, null);
  assertEquals(shadow.dropoff_address, null);
  assertEquals(shadow.counterparty_name, "Alex");

  const open = sanitizeActivityRideForBooker({
    kind: "ride",
    roam_mode: "open_roam",
    pickup_address: "Open St",
    dropoff_address: "Open Ave",
  });
  assertEquals(open.pickup_address, "Open St");
  assertEquals(open.dropoff_address, "Open Ave");
});

Deno.test("sanitizeActivityIntentForTargetBooker — shadow target booker only", () => {
  const shadow = sanitizeActivityIntentForTargetBooker(
    {
      kind: "trip_intent",
      roam_mode: "shadow_roam",
      pickup_address: "Secret St",
      dropoff_address: "Hidden Ave",
      requester_name: "Alex",
    },
    "target_booker",
  );
  assertEquals(shadow.pickup_address, null);
  assertEquals(shadow.dropoff_address, null);
  assertEquals(shadow.requester_name, "Alex");

  const requester = sanitizeActivityIntentForTargetBooker(
    {
      roam_mode: "shadow_roam",
      pickup_address: "Secret St",
    },
    "requester",
  );
  assertEquals(requester.pickup_address, "Secret St");

  const open = sanitizeActivityIntentForTargetBooker(
    {
      roam_mode: "open_roam",
      pickup_address: "Open St",
    },
    "target_booker",
  );
  assertEquals(open.pickup_address, "Open St");
});
