import { assertEquals } from "https://deno.land/std@0.218.2/assert/mod.ts";
import {
  buildCreatePickupLocationResponse,
  expirePickupLocationRequestIfNeeded,
  notifyRiderForPickupLocationRequest,
  PICKUP_LOCATION_REQUEST_TTL_MS,
  resolveDeliveryChannel,
  rowMatchesIncomingRider,
  riderCanRespondToPickupLocationRequest,
  toIncomingPickupLocationRequestDto,
  toPickupLocationRequestDto,
} from "./pickupLocationRequests.ts";
import { normalizePhoneE164, phonesMatch } from "./rideAccess.ts";

Deno.test("resolveDeliveryChannel uses in_app when rider_user_id is set", () => {
  assertEquals(resolveDeliveryChannel("user-123"), "in_app");
  assertEquals(resolveDeliveryChannel(null), "sms");
});

Deno.test("notifyRiderForPickupLocationRequest skips SMS for in_app", async () => {
  let called = false;
  const result = await notifyRiderForPickupLocationRequest({
    deliveryChannel: "in_app",
    phoneE164: "+18761234567",
    bookerName: "Alex",
    shareUrl: "https://example.com/location-share/tok",
    sendNotification: async () => {
      called = true;
      return true;
    },
  });
  assertEquals(called, false);
  assertEquals(result, { sms_attempted: false, sms_sent: false });
});

Deno.test("notifyRiderForPickupLocationRequest sends SMS for sms channel", async () => {
  let called = false;
  const result = await notifyRiderForPickupLocationRequest({
    deliveryChannel: "sms",
    phoneE164: "+18761234567",
    bookerName: "Alex",
    shareUrl: "https://example.com/location-share/tok",
    sendNotification: async () => {
      called = true;
      return true;
    },
  });
  assertEquals(called, true);
  assertEquals(result, { sms_attempted: true, sms_sent: true });
});

Deno.test("buildCreatePickupLocationResponse includes delivery fields", () => {
  const body = buildCreatePickupLocationResponse(
    {
      id: "req-1",
      token: "abc",
      status: "pending",
      rider_name: "Sam",
      rider_phone_e164: "+18761234567",
      rider_source: "roam_tag",
      rider_user_id: "user-1",
      expires_at: "2026-06-16T12:00:00.000Z",
    },
    { delivery_channel: "in_app", sms_attempted: false, sms_sent: false },
  );
  assertEquals(body.delivery_channel, "in_app");
  assertEquals(body.sms_attempted, false);
  assertEquals(body.sms_sent, false);
});

Deno.test("toIncomingPickupLocationRequestDto omits rider phone", () => {
  const dto = toIncomingPickupLocationRequestDto(
    {
      id: "req-1",
      token: "tok",
      status: "pending",
      rider_phone_e164: "+18761234567",
      booker_user_id: "booker-1",
      expires_at: "2026-06-16T12:00:00.000Z",
      created_at: "2026-06-16T11:00:00.000Z",
    },
    "Jordan",
  );
  assertEquals(dto.booker_name, "Jordan");
  assertEquals(dto.token, "tok");
  assertEquals("rider_phone_e164" in dto, false);
});

Deno.test("rowMatchesIncomingRider matches user id or phone", () => {
  const row = {
    rider_user_id: "rider-a",
    rider_phone_e164: "+18761111111",
  };
  assertEquals(rowMatchesIncomingRider(row, "rider-a", "+18762222222"), true);
  assertEquals(rowMatchesIncomingRider(row, "rider-b", "+18761111111"), true);
  assertEquals(rowMatchesIncomingRider(row, "rider-b", "+18763333333"), false);
});

Deno.test("riderCanRespondToPickupLocationRequest allows Roam user id when contact phone differs", () => {
  const row = {
    rider_user_id: "rider-a",
    rider_phone_e164: "+14165551234",
  };
  assertEquals(
    riderCanRespondToPickupLocationRequest(row, "rider-a", "+18761234567"),
    true,
  );
  assertEquals(
    riderCanRespondToPickupLocationRequest(row, "rider-b", "+14165551234"),
    true,
  );
  assertEquals(
    riderCanRespondToPickupLocationRequest(row, "rider-b", "+18761234567"),
    false,
  );
});

Deno.test("PICKUP_LOCATION_REQUEST_TTL_MS is 15 minutes", () => {
  assertEquals(PICKUP_LOCATION_REQUEST_TTL_MS, 15 * 60_000);
});

Deno.test("toPickupLocationRequestDto maps shared location", () => {
  const dto = toPickupLocationRequestDto({
    id: "req-1",
    token: "abc",
    status: "shared",
    rider_name: "Alex",
    rider_phone_e164: "+18761234567",
    rider_source: "roam_tag",
    pickup_lat: 18.0,
    pickup_lng: -77.0,
    pickup_address: "Kingston",
    accuracy_meters: 12,
    expires_at: "2026-06-16T12:00:00.000Z",
    shared_at: "2026-06-16T11:50:00.000Z",
  });
  assertEquals(dto.status, "shared");
  assertEquals(dto.pickup_lat, 18);
  assertEquals(dto.url.includes("/location-share/abc"), true);
});

Deno.test("normalizePhoneE164 accepts JM 10-digit local", () => {
  assertEquals(normalizePhoneE164("8761234567"), "+18761234567");
});

Deno.test("phonesMatch compares normalized numbers", () => {
  assertEquals(phonesMatch("+18761234567", "8761234567"), true);
});

Deno.test("expirePickupLocationRequestIfNeeded marks pending as expired", async () => {
  const updates: Record<string, unknown>[] = [];
  const db = {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          updates.push(patch);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };

  const row = {
    id: "req-1",
    status: "pending",
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  };

  const fresh = await expirePickupLocationRequestIfNeeded(
    db as never,
    "pickup_location_requests",
    row,
  );

  assertEquals(fresh.status, "expired");
  assertEquals(updates[0]?.status, "expired");
});

Deno.test("TERMINAL shared status includes coordinates in dto", () => {
  const dto = toPickupLocationRequestDto({
    id: "req-2",
    token: "tok",
    status: "consumed",
    rider_name: "Sam",
    rider_phone_e164: "+18760000000",
    rider_source: "phone_contact",
    expires_at: "2026-06-16T12:00:00.000Z",
    consumed_at: "2026-06-16T12:05:00.000Z",
  });
  assertEquals(dto.status, "consumed");
});

Deno.test("expirePickupLocationRequestIfNeeded leaves shared unchanged", async () => {
  const db = {
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  };

  const row = {
    id: "req-1",
    status: "shared",
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  };

  const fresh = await expirePickupLocationRequestIfNeeded(
    db as never,
    "pickup_location_requests",
    row,
  );

  assertEquals(fresh.status, "shared");
});
