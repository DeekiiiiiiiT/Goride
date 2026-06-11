import { assertEquals } from "https://deno.land/std@0.218.2/assert/mod.ts";
import {
  classifyTripCategory,
  encodeActivityCursor,
  isWithinHistoryWindow,
  isTerminalRideStatus,
  mapRideToHistoryItem,
  mergeHistoryCandidates,
  paginateActivityTrips,
  parseActivityCursor,
} from "./passengerActivityHistory.ts";

const userId = "user-1";
const emptyNames = new Map<string, string>();

Deno.test("isTerminalRideStatus — terminal vs live", () => {
  assertEquals(isTerminalRideStatus("completed"), true);
  assertEquals(isTerminalRideStatus("cancelled"), true);
  assertEquals(isTerminalRideStatus("on_trip"), false);
  assertEquals(isTerminalRideStatus("matching"), false);
});

Deno.test("classifyTripCategory — self, for_others, for_me", () => {
  const selfRide = {
    rider_user_id: userId,
    passenger_user_id: userId,
  };
  assertEquals(classifyTripCategory(selfRide, userId, "booker"), "self");

  const delegatedBooker = {
    rider_user_id: userId,
    passenger_user_id: "passenger-2",
    guest_passenger_phone: "+18761234567",
  };
  assertEquals(classifyTripCategory(delegatedBooker, userId, "booker"), "for_others");
  assertEquals(classifyTripCategory(delegatedBooker, "passenger-2", "passenger"), "for_me");

  const personal = { rider_user_id: userId, passenger_user_id: null };
  assertEquals(classifyTripCategory(personal, userId, "booker"), "self");
});

Deno.test("mergeHistoryCandidates — dedupes same ride_id", () => {
  const ride = {
    id: "ride-1",
    status: "completed",
    roam_mode: "open_roam",
    rider_user_id: userId,
    passenger_user_id: userId,
    pickup_address: "A St",
    dropoff_address: "B Ave",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };
  const merged = mergeHistoryCandidates(
    [
      { ride, participant_role: "booker" },
      { ride, participant_role: "passenger" },
    ],
    userId,
    emptyNames,
  );
  assertEquals(merged.length, 1);
  assertEquals(merged[0].ride_id, "ride-1");
  assertEquals(merged[0].trip_category, "self");
});

Deno.test("mapRideToHistoryItem — shadow booker nulls addresses", () => {
  const shadow = mapRideToHistoryItem(
    {
      id: "ride-shadow",
      status: "completed",
      roam_mode: "shadow_roam",
      rider_user_id: userId,
      passenger_user_id: "passenger-2",
      guest_passenger_name: "Alex",
      guest_passenger_phone: "+18761234567",
      pickup_address: "Secret St",
      dropoff_address: "Hidden Ave",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      fare_estimate_minor: "2500",
      currency: "JMD",
    },
    userId,
    "booker",
    emptyNames,
  );
  assertEquals(shadow?.pickup_address, null);
  assertEquals(shadow?.dropoff_address, null);
  assertEquals(shadow?.counterparty_name, null);
  assertEquals(shadow?.fare_estimate_minor, "2500");

  const live = mapRideToHistoryItem(
    { id: "ride-live", status: "on_trip", roam_mode: "open_roam", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
    userId,
    "booker",
    emptyNames,
  );
  assertEquals(live, null);
});

Deno.test("paginateActivityTrips — cursor and next_cursor", () => {
  const items = [
    {
      kind: "ride" as const,
      ride_id: "ride-3",
      status: "completed" as const,
      roam_mode: "open_roam" as const,
      participant_role: "booker" as const,
      trip_category: "self" as const,
      counterparty_name: null,
      pickup_address: null,
      dropoff_address: null,
      fare_estimate_minor: null,
      currency: null,
      created_at: "2026-01-03T00:00:00Z",
      ended_at: "2026-01-03T12:00:00Z",
    },
    {
      kind: "ride" as const,
      ride_id: "ride-2",
      status: "cancelled" as const,
      roam_mode: "open_roam" as const,
      participant_role: "passenger" as const,
      trip_category: "for_me" as const,
      counterparty_name: "Sam",
      pickup_address: "A",
      dropoff_address: "B",
      fare_estimate_minor: null,
      currency: null,
      created_at: "2026-01-02T00:00:00Z",
      ended_at: "2026-01-02T12:00:00Z",
    },
    {
      kind: "ride" as const,
      ride_id: "ride-1",
      status: "completed" as const,
      roam_mode: "open_roam" as const,
      participant_role: "booker" as const,
      trip_category: "for_others" as const,
      counterparty_name: "Pat",
      pickup_address: "C",
      dropoff_address: "D",
      fare_estimate_minor: null,
      currency: null,
      created_at: "2026-01-01T00:00:00Z",
      ended_at: "2026-01-01T12:00:00Z",
    },
  ];

  const page1 = paginateActivityTrips(items, 2, null);
  assertEquals(page1.trips.length, 2);
  assertEquals(page1.trips[0].ride_id, "ride-3");
  assertEquals(page1.next_cursor, encodeActivityCursor("2026-01-02T12:00:00Z", "ride-2"));

  const cursor = parseActivityCursor(page1.next_cursor);
  const page2 = paginateActivityTrips(items, 2, cursor);
  assertEquals(page2.trips.length, 1);
  assertEquals(page2.trips[0].ride_id, "ride-1");
  assertEquals(page2.next_cursor, null);
});

Deno.test("isWithinHistoryWindow — 5 day cutoff", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  assertEquals(isWithinHistoryWindow("2026-06-09T12:00:00Z", 5, now), true);
  assertEquals(isWithinHistoryWindow("2026-06-01T12:00:00Z", 5, now), false);
});

Deno.test("parseActivityCursor — invalid input", () => {
  assertEquals(parseActivityCursor(null), null);
  assertEquals(parseActivityCursor(""), null);
  assertEquals(parseActivityCursor("bad"), null);
});
