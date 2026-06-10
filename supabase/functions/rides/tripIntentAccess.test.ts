import { assertEquals } from "https://deno.land/std@0.218.2/assert/mod.ts";
import {
  canBookerCancelShadowRide,
  canShadowBookerAccessLive,
  canShadowBookerChat,
  isShadowBooker,
  isShadowRoamRide,
  sanitizeActivityIntentForTargetBooker,
  sanitizeActivityRideForBooker,
  sanitizeRideForShadowBooker,
  sanitizeTripIntentForBooker,
} from "./tripIntentAccess.ts";

const bookerId = "booker-uuid";
const passengerId = "passenger-uuid";

function shadowRide(overrides: Record<string, unknown> = {}) {
  return {
    rider_user_id: bookerId,
    passenger_user_id: passengerId,
    roam_mode: "shadow_roam",
    status: "on_trip",
    pickup_lat: 18.0,
    pickup_address: "Secret St",
    dropoff_lat: 18.1,
    dropoff_address: "Hidden Ave",
    route_polyline_encoded: "abc",
    last_driver_lat: 18.05,
    ...overrides,
  };
}

Deno.test("isShadowRoamRide", () => {
  assertEquals(isShadowRoamRide(shadowRide()), true);
  assertEquals(isShadowRoamRide({ roam_mode: "open_roam" }), false);
});

Deno.test("isShadowBooker", () => {
  assertEquals(isShadowBooker(shadowRide(), bookerId), true);
  assertEquals(isShadowBooker(shadowRide(), passengerId), false);
});

Deno.test("canBookerCancelShadowRide — always false for shadow booker", () => {
  assertEquals(canBookerCancelShadowRide(shadowRide(), bookerId), false);
  assertEquals(
    canBookerCancelShadowRide({ ...shadowRide(), roam_mode: "open_roam" }, bookerId),
    true,
  );
});

Deno.test("canShadowBookerChat and live access", () => {
  assertEquals(canShadowBookerChat(shadowRide(), bookerId), false);
  assertEquals(canShadowBookerAccessLive(shadowRide(), bookerId), false);
  assertEquals(canShadowBookerAccessLive(shadowRide(), passengerId), true);
});

Deno.test("sanitizeRideForShadowBooker strips locations", () => {
  const out = sanitizeRideForShadowBooker(shadowRide({
    guest_passenger_name: "Alex",
    eta_pickup_seconds_estimate: 300,
    assigned_driver_user_id: "driver-uuid",
  }))!;
  assertEquals("pickup_lat" in out, false);
  assertEquals("pickup_address" in out, false);
  assertEquals("route_polyline_encoded" in out, false);
  assertEquals("eta_pickup_seconds_estimate" in out, false);
  assertEquals("assigned_driver_user_id" in out, false);
  assertEquals(out.status, "on_trip");
  assertEquals(out.guest_passenger_name, "Alex");
});

Deno.test("sanitizeActivityRideForBooker — shadow vs open", () => {
  const shadow = sanitizeActivityRideForBooker({
    roam_mode: "shadow_roam",
    pickup_address: "Secret St",
    dropoff_address: "Hidden Ave",
  });
  assertEquals(shadow.pickup_address, null);
  assertEquals(shadow.dropoff_address, null);

  const open = sanitizeActivityRideForBooker({
    roam_mode: "open_roam",
    pickup_address: "Open St",
    dropoff_address: "Open Ave",
  });
  assertEquals(open.pickup_address, "Open St");
  assertEquals(open.dropoff_address, "Open Ave");
});

Deno.test("sanitizeActivityIntentForTargetBooker — shadow target booker", () => {
  const shadow = sanitizeActivityIntentForTargetBooker(
    { roam_mode: "shadow_roam", pickup_address: "Secret St", dropoff_address: "Hidden Ave" },
    "target_booker",
  );
  assertEquals(shadow.pickup_address, null);
  assertEquals(shadow.dropoff_address, null);
});

Deno.test("sanitizeTripIntentForBooker — shadow has no coords", () => {
  const row = {
    id: "intent-1",
    status: "published",
    pickup_lat: 18,
    pickup_lng: -77,
    dropoff_lat: 18.1,
    dropoff_lng: -77.1,
    vehicle_option: "uberx",
    fare_estimate_minor: "2500",
    currency: "JMD",
    expires_at: new Date().toISOString(),
  };
  const shadow = sanitizeTripIntentForBooker(row, "shadow_roam");
  assertEquals(shadow.has_route, true);
  assertEquals("pickup_lat" in shadow, false);
  const open = sanitizeTripIntentForBooker(row, "open_roam");
  assertEquals("pickup_lat" in open, false);
});
