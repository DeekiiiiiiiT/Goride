import { assertEquals } from "https://deno.land/std@0.218.2/assert/mod.ts";
import {
  canCancelRide,
  canChatOnRide,
  getRideParticipantRole,
  isDelegatedBooking,
  shouldExposePinToUser,
} from "./rideAccess.ts";

const bookerId = "booker-uuid";
const passengerId = "passenger-uuid";
const driverId = "driver-uuid";

function ride(overrides: Record<string, unknown> = {}) {
  return {
    rider_user_id: bookerId,
    passenger_user_id: passengerId,
    assigned_driver_user_id: driverId,
    guest_passenger_phone: "+15551234567",
    status: "driver_en_route_pickup",
    ...overrides,
  };
}

Deno.test("isDelegatedBooking — guest phone", () => {
  assertEquals(isDelegatedBooking(ride()), true);
});

Deno.test("isDelegatedBooking — passenger differs from booker", () => {
  assertEquals(
    isDelegatedBooking(ride({ guest_passenger_phone: null, passenger_user_id: passengerId })),
    true,
  );
});

Deno.test("isDelegatedBooking — self-booked", () => {
  assertEquals(
    isDelegatedBooking({
      rider_user_id: bookerId,
      passenger_user_id: bookerId,
      status: "matching",
    }),
    false,
  );
});

Deno.test("getRideParticipantRole matrix", () => {
  const r = ride();
  assertEquals(getRideParticipantRole(r, bookerId), "booker");
  assertEquals(getRideParticipantRole(r, passengerId), "passenger");
  assertEquals(getRideParticipantRole(r, driverId), "driver");
  assertEquals(getRideParticipantRole(r, "other"), "none");
});

Deno.test("canChatOnRide — booker, passenger, driver on delegated ride", () => {
  const r = ride();
  assertEquals(canChatOnRide(r, bookerId), true);
  assertEquals(canChatOnRide(r, passengerId), true);
  assertEquals(canChatOnRide(r, driverId), true);
  assertEquals(canChatOnRide(r, "other"), false);
});

Deno.test("canCancelRide — passenger any non-terminal", () => {
  assertEquals(canCancelRide(ride({ status: "on_trip" }), passengerId), true);
  assertEquals(canCancelRide(ride({ status: "driver_arrived_pickup" }), passengerId), true);
  assertEquals(canCancelRide(ride({ status: "completed" }), passengerId), false);
});

Deno.test("canCancelRide — booker until arrival", () => {
  assertEquals(canCancelRide(ride({ status: "matching" }), bookerId), true);
  assertEquals(canCancelRide(ride({ status: "driver_en_route_pickup" }), bookerId), true);
  assertEquals(canCancelRide(ride({ status: "driver_arrived_pickup" }), bookerId), false);
  assertEquals(canCancelRide(ride({ status: "on_trip" }), bookerId), false);
});

Deno.test("shouldExposePinToUser — passenger only when delegated", () => {
  const r = ride();
  assertEquals(shouldExposePinToUser(r, passengerId), true);
  assertEquals(shouldExposePinToUser(r, bookerId), false);
  assertEquals(
    shouldExposePinToUser({ rider_user_id: bookerId, status: "matching" }, bookerId),
    true,
  );
});
